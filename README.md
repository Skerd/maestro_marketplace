# marketplace Module (Maestro)

Server-side implementation of the Arpeggio services marketplace: providers publish service listings (packages, add-ons), buyers post task requests and receive bids, and a services order runs through acceptance, escrow-held milestones, deliveries, revisions, bookings, reviews and disputes.

Contracts (types, schema-defs, validators) live in **armonia** at `armonia/src/modules/marketplace/`. The panel and the public `services` section live in **sinfonia** at `sinfonia/src/modules/marketplace/`.

Enable via `ENABLED_MODULES=marketplace` (with `core` and `finance`). The module has no edge to eCommerce, in either direction (D142).

## Directory layout

```
marketplace/
├── api/marketplace/private/        # Panel and buyer routes, /api/marketplace/*; `order.ts` registers the order as
│                                   # finance's `marketplaceOrder` escrow source (escrow viewers, provider earnings)
├── api/marketplace/public/         # Public services pages: shopListings, shopListing, shopProvider, shopListingTaxonomy,
│                                   # shopMarketplaceReviews, servicesConfig; shopTask (one task of the public board, D172)
├── database/
│   ├── moduleBootstrap.ts          # Models, default roles, ref selects, media backfill (Listing, TaskRequest),
│   │                               # reportables (D191)
│   ├── companyDemoSeed.ts          # Settings (listed on the portal), marketplace demo, escrow ledger rows (order 35);
│   │                               # the demo company is Tirana Pros (site slug `pros`), a construction brigade:
│   │                               # ten on-site building listings; its ten building jobs are the demo customers',
│   │                               # stored in the platform company with Tirana Pros' quotes and leads (D197).
│   │                               # Another company: scripts/seed-marketplace-demo.ts --company="<name or id>"
│   │                               # (adds the demo customers to the platform company when missing).
│   │                               # Adria Home Fix's seed also runs demo/taskBoardDemo.ts: the task board's
│   │                               # workflows across the platform company and both services companies (D172)
│   └── schemas/<resource>/         # 16 marketplace models + MarketplaceConfig
├── domain/
│   ├── ai/tools/                   # listings, demand (task requests, bids), service orders, overview
│   ├── notifications/              # TASK_REQUEST_*, BID_*, ORDER_*, DISPUTE_* handlers and codes
│   ├── reports/marketplaceReportables.ts  # What people report to the platform's desk (D191)
│   └── portal/servicesPortalProvider.ts   # Portal section `services` (kind `service`)
│       portal/tasksPortalProvider.ts      # Portal section `tasks` (kind `task`): the public task board (D172)
├── utilities/
│   ├── config.ts                   # Env limits and Stripe Connect return URLs
│   ├── cron/ + cronJobs/           # marketplace.orderAutoComplete, marketplace.taskRequestExpiry
│   ├── erasure/                    # Person eraser: a buyer's order notes (D57)
│   ├── services/                   # marketplaceAccess, providerAvailability, recordHubs
│   └── shop/                       # Public listing filter, portal company rule (marketplaceSellers)
└── websocket/roomContribution.ts   # Site room names of the /marketplace/... panel paths
```

## Settings: `MarketplaceConfig`

One document per company (`/api/marketplace/marketplaceConfig`, `ensure` creates it), copying `CarRentalConfig`:

- `listedOnPortal`: the company's services are listed on the portal apex. A company's own site shows them without it.
- `currency`: the currency a listing, package or add-on priced without one is in, and the default of a task request posted on the services site. Before the settings exist it is the company's first currency.
- `leadCap`, `openJobLimit`: read only from the **platform company's** settings, which are its portal job settings (D197). Its settings page shows only them (the single read marks the record `isPlatform`).

## The platform company keeps the portal's jobs (D197)

Every job a client posts on the portal, its quotes and the job settings live in the **platform company**, where the portal's buyers already are; it runs core only and reaches these through platform routers (core `registerPlatformRouter`: `taskRequest`, `bid`, `marketplaceConfig` and `dispute`), so its panel shows Task requests, Bids and Disputes in a Marketplace sidebar group and the job settings under Configurations (the route contribution's `platformUrls`), without Create on task requests and bids. Code finds it with core `findPlatformCompanyId()` or `jobsCompanyId(lang)`, which fails closed with `marketplace_unavailable`, and reads the job settings with `marketplaceJobLimits()` (`utilities/services/marketplacePlatform.ts`). There is no marketplace operator company any more (D143's, removed by D197).

The **public task board** (D172) lives on the apex only: the portal section `tasks` (`domain/portal/tasksPortalProvider.ts`) lists the platform company's open tasks, and `POST /api/marketplace/shopTask` shows one to anyone; no company's own site carries it, the platform company's included. A public task is every platform task not posted on a provider's own site (`publicTaskClause`, `utilities/services/publicTasks.ts`); it shows what a lead shows before the award (city level, the approximate area) plus the live quotes' count and average (`taskQuoteStats`), the platform company as the board it is posted on (named, never linked to a site) and the companies with a live quote (`taskQuotingCompanies`: name, logo and site only), never the street, pin, buyer or a quote's amount. The platform company runs no marketplace, so it is never a seller or a bidder.

**Quoting from the board (D172):** any company with the module that the portal may show quotes on a public task with `POST /api/marketplace/taskLead/quoteJob` (`_id` = the task; permission `taskleads[action:quoteJob]`). It goes through the caller's lead: the matched one, else a new **board lead** (`TaskLead.origin = board`, no `listing`) in their company, which shares the task's photos (`boardLeadFor`, `utilities/services/taskBoard.ts`); `placeLeadQuote` then places the bid exactly as `quote` does. A company keeps one live quote per task (`assertNoCompanyQuote`, both actions). Board leads do not count towards the lead cap, which limits notifications only. The panel's Task board reads `POST /api/marketplace/taskBoard` (a page of open public tasks, with the caller's own lead and quote) and `/taskBoard/single`. On the portal task page a signed-in user quotes for one of their companies: `POST /api/marketplace/taskBoard/portalOptions` lists the companies their roles let them quote for (core `memberCompaniesFor`) with each one's live quote, and `taskLead/quoteJob` runs for the company named in `actAs` (`@action({memberCompany: true})`, core `resolveMemberCompany` in `authMW`).

**Live (D172):** after the commit of a quote, a new public task, a close (or expiry), a reopen, an award or a rejected quote, `publishTaskChange` (`utilities/services/taskBoardEvents.ts`) sends `TASK_UPDATED` with the task's public state (status, count, the average from three quotes) to the broadcast rooms `liveTaskBoard` and `liveTask_<id>`, registered in `websocket/roomContribution.ts` (core `registerBroadcastRooms`, any signed-in connection may listen); a quote also sends `TASK_QUOTE_RECEIVED` to the buyer. A task posted on a provider's own site is never sent. Codes and room names: armonia `marketplace/websocket/types.ts`.

## Service categories and service areas (D143, D196)

`ListingCategory` is a requestable **platform list** (D160, D196): the platform company owns every row (`tenantScoped: false`, `requestablePlugin`, the router built with `platformListRouteOptions`), every company reads and links to the approved rows (`marketplaceCategoryClause` = core `platformRowsClause`), and another company's create is a request the platform approves. About 3,000 services in 30 sections and 4 levels come from `database/seeds/taxonomy/serviceTaxonomy.json` (written by us, names in en/sq/de/fr/it), seeded by the `platformLists` hook (`serviceTaxonomy.seed.ts`, matched by `taxonomyId`: adds, renames, moves, hides removed rows). That seed also moves the rows the marketplace operator owned before D196 to the platform company in place. Each row stores `names`, `searchText` (every language, which the select searches) and `branch` (its top-level section). A company's **What we provide** (`MarketplaceConfig.branches`) narrows its listing form's picker (`select` with `inCompanyBranches`; `topLevel` lists the sections). Each category has a `delivery`: `onsite` work is matched by distance, `remote` work anywhere. An on-site listing must have a `serviceArea` (pin + `radiusKm`); the listing router keeps its GeoJSON `serviceAreaPoint` for the 2dsphere index (`utilities/services/serviceArea.ts`). `POST /api/marketplace/shopListingTaxonomy` sends the portal only the categories it needs: the used ones with their ancestors (and every section on the apex), or one section's branch with `section`.

## Portal jobs, matching and leads (D143)

A job a portal buyer posts (`taskRequest/createMine`) is saved in the platform company (`asJobBuyer`, `intoPlatform`: the buyer's currency and places, which are platform lists (D160), and the buyer's photos shared with it), limited to the site's company when posted on a company's own site (`restrictedToCompany`), at most `JOB_OPEN_LIMIT` open per buyer. `createJobLeads` (`utilities/services/jobMatching.ts`) finds the providers who do the work (category with its sub- and parent categories; on-site: the pin inside a listing's `serviceArea`, `$geoNear`; online: anywhere), one per provider, best rated then closest, at most `JOB_LEAD_CAP`, and gives each a `TaskLead` in the provider's company, shares the photos with it and sends `TASK_REQUEST_CREATED` there with the `leadId`; the notice opens the lead (its `link`, D145) and `emailNewLeads` (`utilities/services/leadEmails.ts`, template `utilities/emails/templates/newLead`) emails the provider the same, under the same mute switch. Re-matching (`notifyAll`) reaches only providers without a lead.

## Leads (D143)

`/api/marketplace/taskLead` is read-only: a provider company's leads, each with the job read across companies and redacted (no street, postcode, pin or buyer) and the quote placed from it (`utilities/services/taskLeads.ts`). `quote` places a bid next to the job in the platform company through the shared `jobBidData` (`utilities/services/jobBids.ts`), with `bidderCompany`; `decline` passes. The platform company's `MarketplaceConfig.leadCap` and `openJobLimit` (unset = 10 and 5) tune the matching and the buyer limit.

## Buyer side (D146)

A job's budget is one optional "up to" amount (`budgetMax`). An on-site job needs its address and pin (`assertJobAddress`); a remote one has none. The buyer's `mySingle` lists each quote with its company and matched listing (`quotesForBuyer`); each new quote emails the buyer (`emailNewQuote`, template `utilities/emails/templates/newQuote`), since the portal has no notification list. A portal buyer's `bid/reject` runs in the platform company and marks the quote's lead `lost`; the provider's `BID_REJECTED` notice opens that lead.

## Portal buyer routes

Portal accounts belong to the platform company, which does not have this module. Each buyer route declares the company its record lives in, and core's module gate checks that company instead (`portalBuyer`, `utilities/services/portalBuyerTargets.ts`): the order's seller for order actions and `order/mySingle` (`orderSeller("_id")`), reviews, disputes and bookings (`orderSeller("order")`); the listing's seller for `createFromListing` (`listingSeller`); the milestone's for `releaseMilestone` (`milestoneSeller`); the platform company for what spans sellers: `order/my`, `taskBoard/portalOptions` and the job and bid routes (`platformCompany`), which core lets answer the gate for a module the server runs (D197).

## Reports, reviews and disputes (D191)

**Reports go to the platform, not to the seller.** `domain/reports/marketplaceReportables.ts` declares four kinds for
core's report desk (`moduleBootstrap.reportables`): `marketplace.listing`, `marketplace.job` (a task request),
`marketplace.bid` and `marketplace.review`. The desk reads one by its id across companies (`snapshot`: title or excerpt,
owning company, the author for a job, bid or review, its portal page) and hides or shows it with `setHidden`, which sets
the server-only `hiddenByPlatform` in the company that keeps it. Every public read leaves a hidden record out
(`notHiddenByPlatform`, `utilities/services/platformHidden.ts`): the portal catalog, search, sitemap and landing pages, a
company's services site and provider pages (`publicListingClause`), the task board and its live updates
(`publicTaskClause`), job matching and the providers' leads, the buyer's quotes, public reviews and every rating
(`refreshListingRating`, provider metrics). Staff of the owning company still see it, with a "Hidden by the platform"
note on its sheet and card. The marketplace's own listing reports (`ListingFlag`, which went to the seller) are gone.

**Reviews are published by default.** No one deletes a review (`Review` model: `delete: "no-permission"`); the company
reports one to the platform from its panel.

**The platform company decides disputes (D191, D197).** `startReview`, `resolve` and `close` are taken only by an admin
of the platform company and run in the dispute's own company (`inDisputeCompany`, `utilities/services/platformDisputes.ts`),
where its order, deliveries and escrow live; deleting or restoring a dispute is the platform's too
(`dispute_platform_only`). The seller and the buyer see their dispute read-only; the provider may still cancel and
refund the order while it is open. A new dispute notifies the platform company's admins (`DISPUTE_TO_DECIDE`). Its
panel lists every company's disputes: `POST /api/marketplace/dispute/access` (`isPlatform`), `/platform` and
`/platform/single`.

## Environment

| Variable | Default | What |
|----------|---------|------|
| `MARKETPLACE_AUTO_ACCEPT_DAYS` | 3 | Days after a delivery's due date before it is accepted for the buyer |
| `MARKETPLACE_MAX_REVISIONS` | 3 | Revision requests allowed per order |
| `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL` | panel `/account/providerprofile?connect=…` | Stripe Connect onboarding redirects |
| `KAFKA_TOPIC_NEW_LEAD_EMAIL`, `KAFKA_CONSUMER_GROUP_NEW_LEAD_EMAIL` | none, required while Kafka is on | The new-lead email's topic and group (D188) |
| `KAFKA_TOPIC_NEW_QUOTE_EMAIL`, `KAFKA_CONSUMER_GROUP_NEW_QUOTE_EMAIL` | none, required while Kafka is on | The new-quote email's topic and group (D188) |

The new-lead and new-quote emails go through those topics so they survive a restart and are retried (D188, BE-10), and are sent in-process when core `publishEvent` returns `false`. `startMarketplaceKafkaConsumers` (`kafka/kafkaConsumer.ts`) consumes both.

## Cron handlers

Registered in `utilities/cron/registerHandlers.ts`; every run is company-scoped.

| Code | Schedule | What it does |
|------|----------|--------------|
| `marketplace.orderAutoComplete` | hourly | Accepts deliveries the customer left unanswered for `autoAcceptDays` and completes the order |
| `marketplace.taskRequestExpiry` | hourly | Closes open task requests past `expiresAt` and tells the users still waiting on a bid |

## Default roles

`marketplace_operator` (runs listings, demand, orders, disputes, reviews, provider profiles and the settings) and `marketplace_analyst` (reads all of it).

## Path alias

```ts
import Listing from "@marketplaceModule/database/schemas/listing/listing";
```

## Award and after (D147)

`bid/accept` on a quote from a lead opens the order in the winning provider's company (`utilities/services/jobOutcome.ts`, `openAwardOrder`) and ends the job's leads `won`/`lost` (`endJobLeads`); a won lead shows the address and buyer contact. `closeTaskRequest` (the buyer's close and the hourly expiry) expires the open leads, and a reopen brings them back (`reviveJobLeads`). `matchListingToOpenJobs` (a listing goes live or changes category or area) and the daily `marketplace.taskRematch` cron top open jobs up to their lead cap. A portal buyer splits their order into milestones (`order/createMilestone`).

Before the award a lead shows the job's approximate area: `TaskRequest.approxPoint`, drawn once 100–500 m from the pin (`utilities/services/jobLocation.ts`, D148), shown as a 600 m area on the lead sheet; the won lead shows the exact pin.
