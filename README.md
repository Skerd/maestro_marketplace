# marketplace Module (Maestro)

Server-side implementation of the Arpeggio services marketplace: providers publish service listings (packages, add-ons), buyers post task requests and receive bids, and a services order runs through acceptance, escrow-held milestones, deliveries, revisions, bookings, reviews and disputes.

Contracts (types, schema-defs, validators) live in **armonia** at `armonia/src/modules/marketplace/`. The panel and the public `services` section live in **sinfonia** at `sinfonia/src/modules/marketplace/`.

Enable via `ENABLED_MODULES=marketplace` (with `core` and `finance`). The module has no edge to eCommerce, in either direction (D142).

## Status

Being moved out of eCommerce (roadmap P11, D142). Until P11.3 lands, the runtime still lives in `maestro/modules/eCommerce` under `api/eCommerceMarketplace`.
