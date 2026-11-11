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
│   ├── companyDemoSeed.ts          # Settings (listed on the portal), marketplace demo, escrow ledger rows (order 35)
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
