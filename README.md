# marketplace Module (Maestro)

Server-side implementation of the Arpeggio services marketplace: providers publish service listings (packages, add-ons), buyers post task requests and receive bids, and a services order runs through acceptance, escrow-held milestones, deliveries, revisions, bookings, reviews and disputes.

Contracts (types, schema-defs, validators) live in **armonia** at `armonia/src/modules/marketplace/`. The panel and the public `services` section live in **sinfonia** at `sinfonia/src/modules/marketplace/`.

Enable via `ENABLED_MODULES=marketplace` (with `core` and `finance`). The module has no edge to eCommerce, in either direction (D142).

## Directory layout

```
marketplace/
├── api/marketplace/private/        # Panel and buyer routes, /api/marketplace/*
├── api/marketplace/public/         # Public services pages: shopListings, shopListing, shopProvider, shopListingTaxonomy,
│                                   # shopMarketplaceReviews, servicesConfig
├── database/
│   ├── moduleBootstrap.ts          # Models, default roles, ref selects, media backfill (Listing, TaskRequest)
│   ├── companyDemoSeed.ts          # Settings (listed on the portal), marketplace demo, escrow ledger rows (order 35);
│   │                               # the demo company is Tirana Pros (site slug `pros`)
│   └── schemas/<resource>/         # 16 marketplace models + MarketplaceConfig
├── domain/
│   ├── ai/tools/                   # listings, demand (task requests, bids), service orders, overview
│   ├── notifications/              # TASK_REQUEST_*, BID_*, ORDER_*, DISPUTE_* handlers and codes
│   └── portal/servicesPortalProvider.ts   # Portal section `services` (kind `service`)
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
- `isOperator` (seed-only, one per database): this company operates the marketplace (D143).

## The marketplace operator (D143)

The core company seed creates **Arpeggio Services** (VAT `MARKETPLACE_OPERATOR_VAT`, protected, modules core + finance + marketplace). This module's demo seed marks its settings `isOperator` and gives it no listings or orders. It owns the shared service categories and the jobs posted on the portal (roadmap P12.1, P12.2). Code finds it with `findMarketplaceOperatorId()` or `marketplaceOperatorCompanyId(lang)`, which fails closed with `marketplace_unavailable` (`utilities/services/marketplaceOperator.ts`).

## Service categories and service areas (D143, D144)

`ListingCategory` is one platform-wide tree, not scoped to a company (`tenantScoped: false`): the operator owns every row and is the only company that writes one (`assertMarketplaceOperatorSession`); every read names the operator's rows (`marketplaceCategoryClause`). Each category has a `delivery`: `onsite` work is matched by distance, `remote` work anywhere. An on-site listing must have a `serviceArea` (pin + `radiusKm`); the listing router keeps its GeoJSON `serviceAreaPoint` for the 2dsphere index (`utilities/services/serviceArea.ts`). The panel asks `POST /api/marketplace/listingCategory/access` whether the session company may manage the tree.

## Portal jobs, matching and leads (D143)

A job a portal buyer posts (`taskRequest/createMine`) is saved in the operator (`asJobBuyer`, `intoOperator`: the operator's own currency and places, the buyer's photos shared with it), limited to the site's company when posted on a company's own site (`restrictedToCompany`), at most `JOB_OPEN_LIMIT` open per buyer. `createJobLeads` (`utilities/services/jobMatching.ts`) finds the providers who do the work (category with its sub- and parent categories; on-site: the pin inside a listing's `serviceArea`, `$geoNear`; online: anywhere), one per provider, best rated then closest, at most `JOB_LEAD_CAP`, and gives each a `TaskLead` in the provider's company, shares the photos with it and sends `TASK_REQUEST_CREATED` there with the `leadId`; the notice opens the lead (its `link`, D145) and `emailNewLeads` (`utilities/services/leadEmails.ts`, template `utilities/emails/templates/newLead`) emails the provider the same, under the same mute switch. Re-matching (`notifyAll`) reaches only providers without a lead.

## Leads (D143)

`/api/marketplace/taskLead` is read-only: a provider company's leads, each with the job read across companies and redacted (no street, postcode, pin or buyer) and the quote placed from it (`utilities/services/taskLeads.ts`). `quote` places a bid next to the job in the operator through the shared `jobBidData` (`utilities/services/jobBids.ts`), with `bidderCompany`; `decline` passes. The operator's `MarketplaceConfig.leadCap` and `openJobLimit` (unset = 10 and 5) tune the matching and the buyer limit.

## Buyer side (D146)

A job's budget is one optional "up to" amount (`budgetMax`). An on-site job needs its address and pin (`assertJobAddress`); a remote one has none. The buyer's `mySingle` lists each quote with its company and matched listing (`quotesForBuyer`); each new quote emails the buyer (`emailNewQuote`, template `utilities/emails/templates/newQuote`), since the portal has no notification list. A portal buyer's `bid/reject` runs in the operator and marks the quote's lead `lost`; the provider's `BID_REJECTED` notice opens that lead.

## Portal buyer routes

Portal accounts belong to the platform company, which does not have this module. Each buyer route declares the company its record lives in, and core's module gate checks that company instead (`portalBuyer`, `utilities/services/portalBuyerTargets.ts`): the order's seller for order actions and `order/mySingle` (`orderSeller("_id")`), reviews, disputes and bookings (`orderSeller("order")`); the listing's seller for `createFromListing` (`listingSeller`); the milestone's for `releaseMilestone` (`milestoneSeller`); the operator for `order/my`. The job routes (`createMine`, `my`, `mySingle`, `close`, `reopen`) name the operator (`marketplaceOperator`); bid routes follow in P12.3.

## Environment

| Variable | Default | What |
|----------|---------|------|
| `MARKETPLACE_AUTO_ACCEPT_DAYS` | 3 | Days after a delivery's due date before it is accepted for the buyer |
| `MARKETPLACE_MAX_REVISIONS` | 3 | Revision requests allowed per order |
| `STRIPE_CONNECT_RETURN_URL`, `STRIPE_CONNECT_REFRESH_URL` | panel `/account/providerprofile?connect=…` | Stripe Connect onboarding redirects |

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
