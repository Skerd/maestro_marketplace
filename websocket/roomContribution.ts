import {registerRoomDisplayNames} from "@coreModule/websocket/roomRegistry";

/**
 * Site rooms for the marketplace panel paths (`/marketplace/...`).
 * Keep in sync with the marketplace sidebarContribution + routeConfigContribution.
 */
export function registerMarketplaceRoomContributions(): void {
    registerRoomDisplayNames({
        marketplacesystemmap: "Marketplace system map",
        listings: "Listings",
        listingflags: "Listing flags",
        promotions: "Promotions",
        taskrequests: "Task requests",
        bids: "Bids",
        orders: "Orders",
        disputes: "Disputes",
        reviews: "Reviews",
        bookings: "Bookings",
        providerprofile: "Provider profile",
        listingaddons: "Listing add-ons",
        listingpackages: "Listing packages",
        listingcategories: "Listing categories",
        listingcategories_configurations: "Listing categories configurations",
        marketplacesettings_configurations: "Marketplace settings",
    });
}
