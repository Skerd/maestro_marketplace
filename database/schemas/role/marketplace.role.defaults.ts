import type {DefaultRoleDefinition} from "@coreModule/database/schemas/role/role.defaults";

// RolePermission groups are the capitalised collection names.
const catalogOwn = ["Listings", "Listingcategories", "Listingpackages", "Listingaddons", "Listingflags", "Promotions", "Providerprofiles"];
const demandOwn = ["Taskrequests", "Marketplacebids", "Orders", "Bookings", "Disputes", "Reviews"];
const settingsOwn = ["Marketplaceconfigs"];
// Deliveries, milestones and revisions are written through the order's own actions, so they are only ever read.
const ledgerRead = ["Orderdeliveries", "Ordermilestones", "Orderrevisions"];

function marketplaceRole(name: string, slug: string, description: string, permissionGroups: string[], readPermissionGroups: string[]): DefaultRoleDefinition {
    return {
        name,
        slug,
        description,
        isAdmin: false,
        isSignupDefault: false,
        canEdit: true,
        canDelete: false,
        permissionGroups,
        readPermissionGroups,
    };
}

export const marketplaceDefaultRoles: DefaultRoleDefinition[] = [
    marketplaceRole(
        "Marketplace Operator",
        "marketplace_operator",
        "Runs the services marketplace: listings, task requests, bids, escrowed orders, disputes, reviews, and provider profiles.",
        [...catalogOwn, ...demandOwn, ...settingsOwn],
        ledgerRead,
    ),
    marketplaceRole(
        "Marketplace Analyst",
        "marketplace_analyst",
        "Read-only access across listings, task requests, bids, escrowed orders, disputes, reviews, and provider profiles. Cannot change anything.",
        [],
        [...catalogOwn, ...demandOwn, ...settingsOwn, ...ledgerRead],
    ),
];
