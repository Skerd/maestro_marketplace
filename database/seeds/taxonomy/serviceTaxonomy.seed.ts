import fs from "fs";
import path from "path";
import {ObjectId} from "mongodb";
import type {PlatformListsContext} from "@coreModule/utilities/modules/moduleCompanyDefaults";
import {getLogger} from "@coreModule/loggers/serverLog";
import {LIST_NAME_LANGUAGES, listSearchText, type ListNames} from "@coreModule/utilities/helpers/listNames";
import {nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import ListingCategory from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import type {ListingCategoryDelivery} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.schema-def";

/** One row of `serviceTaxonomy.json`: parents come before their children. `id` is the entry's first slug and never changes. */
export type ServiceTaxonomyRow = {
    id: string;
    parent: string | null;
    order: number;
    slug: string;
    delivery: ListingCategoryDelivery;
    name: Required<ListNames>;
};
export type ServiceTaxonomyFile = {source: {release: string}; categories: ServiceTaxonomyRow[]};

const DATA_FILE = path.join(__dirname, "serviceTaxonomy.json");

/** The service taxonomy data file, or null when it is missing. */
export function loadServiceTaxonomyFile(): ServiceTaxonomyFile | null {
    return fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) as ServiceTaxonomyFile : null;
}

type ExistingRow = {
    _id: ObjectId;
    taxonomyId: string;
    name: string;
    names?: ListNames;
    parent?: ObjectId;
    branch?: ObjectId;
    order: number;
    delivery?: string;
    deletedAt?: Date | null;
};

/**
 * The service tree used to belong to the marketplace operator (D144). Its rows move to the platform company in place,
 * so every listing, job and lead keeps pointing at the same ids, and a row whose slug is a taxonomy entry becomes that
 * entry (D196). Runs at every setup; once moved there is nothing left to move.
 */
async function adoptOperatorRows(platformCompanyId: ObjectId, taxonomyIds: Set<string>): Promise<number> {
    const moved = await ListingCategory.collection.updateMany(
        {company: {$ne: platformCompanyId}, requestStatus: {$exists: false}},
        {$set: {company: platformCompanyId}},
    );
    const unclaimed = await ListingCategory.collection
        .find({company: platformCompanyId, taxonomyId: {$exists: false}, requestStatus: {$exists: false}}, {projection: {slug: 1}})
        .toArray();
    const claims = unclaimed
        .filter((row) => typeof row.slug === "string" && taxonomyIds.has(row.slug))
        .map((row) => ({updateOne: {filter: {_id: row._id}, update: {$set: {taxonomyId: row.slug as string}}}}));
    if (claims.length > 0) await ListingCategory.collection.bulkWrite(claims);
    return moved.modifiedCount;
}

/**
 * Seeds the platform service categories (D196) from the taxonomy data file: the `platformLists` hook of the
 * marketplace's module bootstrap, run at every database setup. Rows are matched by their taxonomy id, so a newer data
 * file adds the new categories, renames and moves the changed ones, and hides (soft-deletes) the ones that left it; a
 * hidden row keeps every listing and job that links to it. Categories companies requested (no taxonomy id) are never touched.
 */
export async function seedServiceTaxonomy(
    {platformCompany, logger: parentLogger}: PlatformListsContext,
    data: ServiceTaxonomyFile | null = loadServiceTaxonomyFile(),
): Promise<void> {
    const logger = getLogger("mongoDbInitialization-serviceTaxonomy", parentLogger);
    if (!data) {
        logger.warn("No service taxonomy data file; platform service categories not seeded.");
        return;
    }
    logger.start(`Seeding ${data.categories.length} platform service categories (taxonomy ${data.source.release})...`);
    const platformId = platformCompany._id as ObjectId;
    const moved = await adoptOperatorRows(platformId, new Set(data.categories.map((row) => row.id)));

    const existing: ExistingRow[] = (await ListingCategory.collection
        .find({company: platformId, taxonomyId: {$type: "string"}})
        .toArray()).map((row) => ({
        _id: row._id,
        taxonomyId: row.taxonomyId,
        name: row.name,
        names: row.names,
        parent: nestedEntityToRef(row.parentListingCategory),
        branch: row.branch,
        order: row.order,
        delivery: row.delivery,
        deletedAt: row.deletedAt,
    }));
    const byTaxonomyId = new Map(existing.map((row) => [row.taxonomyId, row]));
    // Slugs requested categories and the platform's own already hold stay theirs; a taxonomy row takes `<slug>-service`.
    const takenSlugs = new Set((await ListingCategory.collection
        .find({company: platformId, taxonomyId: {$not: {$type: "string"}}}, {projection: {slug: 1}})
        .toArray()).map((row) => row.slug));

    const idOf = new Map<string, ObjectId>(existing.map((row) => [row.taxonomyId, row._id]));
    for (const row of data.categories) if (!idOf.has(row.id)) idOf.set(row.id, new ObjectId());
    const branchOf = new Map<string, ObjectId | undefined>();

    const now = new Date();
    const inserts: InstanceType<typeof ListingCategory>[] = [];
    const updates: {updateOne: {filter: object; update: object}}[] = [];
    for (const row of data.categories) {
        const parent = row.parent ? idOf.get(row.parent) : undefined;
        // Parents come first, so the section above is known: the parent's, or the row itself at the top.
        const branch = row.parent ? branchOf.get(row.parent) : idOf.get(row.id);
        branchOf.set(row.id, branch);
        const current = byTaxonomyId.get(row.id);
        if (!current) {
            inserts.push(new ListingCategory({
                _id: idOf.get(row.id),
                company: platformId,
                createdBy: platformCompany.createdBy,
                name: row.name.en,
                names: row.name,
                slug: takenSlugs.has(row.slug) ? `${row.slug}-service` : row.slug,
                parentListingCategory: parent,
                order: row.order,
                delivery: row.delivery,
                taxonomyId: row.id,
                branch,
                searchText: listSearchText(row.name.en, row.name),
                requestStatus: "approved",
            }));
            continue;
        }
        const sameNames = LIST_NAME_LANGUAGES.every((language) => current.names?.[language] === row.name[language]);
        const sameParent = String(current.parent ?? "") === String(parent ?? "");
        const sameBranch = String(current.branch ?? "") === String(branch ?? "");
        if (sameNames && sameParent && sameBranch && current.name === row.name.en && current.order === row.order
            && current.delivery === row.delivery && !current.deletedAt) continue;
        updates.push({updateOne: {
            filter: {_id: current._id},
            update: {$set: {
                name: row.name.en,
                names: row.name,
                parentListingCategory: parent ?? null,
                branch,
                order: row.order,
                delivery: row.delivery,
                searchText: listSearchText(row.name.en, row.name),
                deletedAt: null,
                updatedAt: now,
            }},
        }});
    }

    const inFile = new Set(data.categories.map((row) => row.id));
    const gone = existing.filter((row) => !inFile.has(row.taxonomyId) && !row.deletedAt).map((row) => row._id);

    if (inserts.length > 0) await ListingCategory.bulkSave(inserts);
    if (updates.length > 0) await ListingCategory.bulkWrite(updates);
    if (gone.length > 0) await ListingCategory.updateMany({_id: {$in: gone}}, {$set: {deletedAt: now}});
    logger.finish(`Platform service categories: ${moved} moved from the operator, ${inserts.length} added, ${updates.length} updated, ${gone.length} hidden.`);
}
