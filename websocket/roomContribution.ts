import {registerBroadcastRooms, registerRoomDisplayNames} from "@coreModule/websocket/roomRegistry";
import {TASK_BOARD_ROOM, TASK_ROOM_FAMILY} from "armonia/src/modules/marketplace/websocket/types";

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
        taskboard: "Task board",
    });
    // The public task board's live updates (D172): they carry only what the board shows anyone, so any signed-in
    // connection may listen (anonymous visitors have no socket).
    registerBroadcastRooms({name: TASK_BOARD_ROOM, canJoin: () => true});
    registerBroadcastRooms({name: TASK_ROOM_FAMILY, canJoin: () => true});
}
