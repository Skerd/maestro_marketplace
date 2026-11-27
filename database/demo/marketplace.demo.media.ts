/**
 * Unsplash photo kits for marketplace demo listings and task requests.
 * Same pattern as product catalog media: main + gallery shots that match the
 * seed topic (building site, bathroom, roof, facade, …) instead of blue tiles.
 */

export type MarketplacePhotoKit = readonly [string, string, string];

/** seedKey → [main, gallery-1, gallery-2] Unsplash photo ids (without `photo-`). */
export const LISTING_PHOTO_KITS: Readonly<Record<string, MarketplacePhotoKit>> = {
    // The construction brigade (on site): renovation, bathrooms, kitchens, shell, trades, roofs, terraces, facades.
    "listing-01-apartment-renovation": ["1517581177682-a085bb7ffb15", "1581858726788-75bc0f6a952d", "1618221195710-dd6b41faaea6"],
    "listing-02-bathroom-renovation": ["1631889993959-41b4e9c6e3c5", "1600566752355-35792bedcfea", "1552321554-5fefe8c9ef14"],
    "listing-03-kitchen-renovation": ["1556912172-45b7abe8b7e1", "1507089947368-19c1da9775ae", "1484154218962-a197022b5858"],
    "listing-04-house-shell": ["1541888946425-d81bb19240f5", "1531834685032-c34bf0d84c77", "1503387762-592deb58ef4e"],
    "listing-05-tiling": ["1620626011761-996317b8d101", "1600607687939-ce8a6c25118c", "1513694203232-719a280e022f"],
    "listing-06-plastering": ["1562259949-e8e7689d7828", "1595846519845-68e298c2edd8", "1501183638710-841dd1904471"],
    "listing-07-masonry-crew": ["1504307651254-35680f356dfd", "1508450859948-4e04fabaa4ea", "1589939705384-5185137a7f0f"],
    "listing-08-roof-repair": ["1632759145351-1d592919f522", "1503594384566-461fe158e797", "1572120360610-d971b9d7767c"],
    "listing-09-terrace-waterproofing": ["1600573472550-8090b5e0745e", "1564013799919-ab600027ffc6", "1416331108676-a22ccb276e35"],
    "listing-10-facade-insulation": ["1574359411659-15573a27fd0c", "1600047509807-ba8f99d2cdde", "1600585154526-990dced4db0d"],
    // Home services (on-site, D143): tap, pipes, electrician, cleaning, tools.
    "home-01-leaks": ["1585704032915-c3400ca199e7", "1584622650111-993a426fbf0a", "1607472586893-edb57bdc0e39"],
    "home-02-drains": ["1607472586893-edb57bdc0e39", "1584622650111-993a426fbf0a", "1585704032915-c3400ca199e7"],
    "home-03-boilers": ["1558618666-fcd25c85cd64", "1607472586893-edb57bdc0e39", "1584622650111-993a426fbf0a"],
    "home-04-electrical": ["1621905251918-48416bd8575a", "1621905252507-b35492cc74b4", "1504148455328-c376907d081c"],
    "home-05-cleaning": ["1581578731548-c64695cc6952", "1563453392212-326f5e854473", "1527515637462-cff94eecc1ac"],
    "home-06-handyman": ["1504148455328-c376907d081c", "1556911220-bff31c812dba", "1600585152220-90363fe7e115"],
};

export const TASK_REQUEST_PHOTO_KITS: Readonly<Record<string, MarketplacePhotoKit>> = {
    "task-01-house-build": ["1600585154340-be6161a56a0c", "1503387762-592deb58ef4e", "1541888946425-d81bb19240f5"],
    "task-02-bathroom-refit": ["1552321554-5fefe8c9ef14", "1620626011761-996317b8d101", "1631889993959-41b4e9c6e3c5"],
    "task-03-office-fitout": ["1513694203232-719a280e022f", "1581858726788-75bc0f6a952d", "1600210492486-724fe5c67fb0"],
    "task-04-terrace-leak": ["1600573472550-8090b5e0745e", "1632759145351-1d592919f522", "1564013799919-ab600027ffc6"],
    "task-05-shop-strip-out": ["1517581177682-a085bb7ffb15", "1504917595217-d4dc5ebe6122", "1513467535987-fd81bc7d62f8"],
    "task-06-retaining-wall": ["1517089596392-fb9a9033e05b", "1503708928676-1cb796a0891e", "1558036117-15d82a90b9b1"],
    "task-07-attic-conversion": ["1590725140246-20acdee442be", "1501183638710-841dd1904471", "1505798577917-a65157d3320a"],
    "task-08-facade-repair": ["1574359411659-15573a27fd0c", "1599707254554-027aeb4deacd", "1565008447742-97f6f38c985c"],
    "task-09-kitchen-tiles": ["1556912172-45b7abe8b7e1", "1484154218962-a197022b5858", "1504148455328-c376907d081c"],
    "task-10-steel-stairs": ["1504917595217-d4dc5ebe6122", "1600573472550-8090b5e0745e", "1621905251189-08b45d6a269e"],
    // The public task board's two online jobs (`taskBoardDemo.ts`).
    "board-02-logo": ["1469334031218-e382a71b716b", "1558655146-d09347e92766", "1618354691373-d851c5c3a990"],
    "board-05-translation": ["1454165804606-c3d57bc86b40", "1450101499163-c8848c66ca85", "1542744173-8e7e53415bb0"],
};

export function resolveListingPhotoIds(seedKey: string): string[] {
    return [...(LISTING_PHOTO_KITS[seedKey] ?? [])];
}

export function resolveTaskRequestPhotoIds(seedKey: string): string[] {
    return [...(TASK_REQUEST_PHOTO_KITS[seedKey] ?? [])];
}
