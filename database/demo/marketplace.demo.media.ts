/**
 * Unsplash photo kits for marketplace demo listings and task requests.
 * Same pattern as product catalog media: main + gallery shots that match the
 * seed topic (logo desk, coding laptop, mic booth, …) instead of blue tiles.
 */

export type MarketplacePhotoKit = readonly [string, string, string];

/** seedKey → [main, gallery-1, gallery-2] Unsplash photo ids (without `photo-`). */
export const LISTING_PHOTO_KITS: Readonly<Record<string, MarketplacePhotoKit>> = {
    "listing-01-logo-design": [
        "1561070791-2526d30994b5",
        "1558655146-d09347e92766",
        "1611224923853-80b023f02d71",
    ],
    "listing-02-website-dev": [
        "1461749280684-dccba630e2f6",
        "1498050108023-c5249f4df085",
        "1517694712202-14dd9538aa97",
    ],
    "listing-03-blog-writing": [
        "1455390582262-044cdead277a",
        "1486312338219-ce68d2c6f44d",
        "1434030216411-0b793f4b4173",
    ],
    "listing-04-social-media": [
        "1611162616305-c69b3fa7fbe0",
        "1611162618071-b39a2ec055fb",
        "1557804506-669a67965ba0",
    ],
    "listing-05-video-editing": [
        "1574717024653-61fd2cf4d44d",
        "1492691527719-9d1e07e534b4",
        "1478720568477-152d9b164e26",
    ],
    "listing-06-voice-over": [
        "1590602847861-f357a9332bbc",
        "1511379938547-c1f69419868d",
        "1598488035139-bdbb2231ce04",
    ],
    "listing-07-virtual-assistant": [
        "1600880292203-757bb62b4baf",
        "1552664730-d307ca884978",
        "1542744173-8e7e53415bb0",
    ],
    "listing-08-product-photo": [
        "1526170375885-4d8ecf77b99f",
        "1516035069371-29a1b244cc32",
        "1542291026-7eec264c27ff",
    ],
    "listing-09-mobile-apps": [
        "1511707171634-5f897ff02aa9",
        "1556656793-08538906a9f8",
        "1517336714731-489689fd1ca8",
    ],
    "listing-10-seo": [
        "1460925895917-afdab827c52f",
        "1551288049-bebda4e38f71",
        "1543286386-713bdd548da4",
    ],
};

export const TASK_REQUEST_PHOTO_KITS: Readonly<Record<string, MarketplacePhotoKit>> = {
    "task-01-mobile-app": [
        "1571019613454-1cb2f99b2d8b",
        "1511707171634-5f897ff02aa9",
        "1556656793-08538906a9f8",
    ],
    "task-02-social-graphics": [
        "1482049016688-2d3e1b311543",
        "1611162616305-c69b3fa7fbe0",
        "1561070791-2526d30994b5",
    ],
    "task-03-ecommerce-setup": [
        "1607083206869-4c7672e72a8a",
        "1472851294608-062f824d29cc",
        "1526170375885-4d8ecf77b99f",
    ],
    "task-04-seo-audit": [
        "1551288049-bebda4e38f71",
        "1460925895917-afdab827c52f",
        "1504868584819-f8e8b4b6d7e3",
    ],
    "task-05-product-video": [
        "1492691527719-9d1e07e534b4",
        "1574717024653-61fd2cf4d44d",
        "1516035069371-29a1b244cc32",
    ],
    "task-06-podcast-editing": [
        "1598488035139-bdbb2231ce04",
        "1590602847861-f357a9332bbc",
        "1511379938547-c1f69419868d",
    ],
    "task-07-business-plan": [
        "1454165804606-c3d57bc86b40",
        "1450101499163-c8848c66ca85",
        "1542744173-8e7e53415bb0",
    ],
    "task-08-wordpress-migration": [
        "1498050108023-c5249f4df085",
        "1461749280684-dccba630e2f6",
        "1516321318423-f06f85e504b3",
    ],
    "task-09-brand-identity": [
        "1469334031218-e382a71b716b",
        "1558655146-d09347e92766",
        "1618354691373-d851c5c3a990",
    ],
    "task-10-data-dashboard": [
        "1551288049-bebda4e38f71",
        "1543286386-713bdd548da4",
        "1460925895917-afdab827c52f",
    ],
};

export function resolveListingPhotoIds(seedKey: string): string[] {
    return [...(LISTING_PHOTO_KITS[seedKey] ?? [])];
}

export function resolveTaskRequestPhotoIds(seedKey: string): string[] {
    return [...(TASK_REQUEST_PHOTO_KITS[seedKey] ?? [])];
}
