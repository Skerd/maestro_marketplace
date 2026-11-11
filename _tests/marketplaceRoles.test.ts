import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import {describe, expect, it} from "vitest";
import {normalizeSchemaPermissions} from "@coreModule/database/utilities";
import {marketplaceDefaultRoles} from "@marketplaceModule/database/schemas/role/marketplace.role.defaults";

/** Permission groups the marketplace models actually generate (capitalised tag prefix, as createRolePermissions names them). */
async function marketplacePermissionGroups(): Promise<Set<string>> {
    const schemasDir = path.resolve(__dirname, "../database/schemas");
    for (const name of fs.readdirSync(schemasDir)) {
        const modelFile = path.join(schemasDir, name, `${name}.ts`);
        if (fs.existsSync(modelFile)) await import(modelFile);
    }
    const groups = new Set<string>();
    for (const modelName of mongoose.modelNames()) {
        // As the API boot does for every model (some don't normalize themselves)
        normalizeSchemaPermissions(mongoose.model(modelName));
        mongoose.model(modelName).schema.eachPath((_path, schemaType) => {
            const tag: unknown = schemaType.options?.permissions?.self?.read;
            if (typeof tag === "string" && tag.includes("[")) {
                const prefix = tag.slice(0, tag.indexOf("["));
                groups.add(prefix.charAt(0).toUpperCase() + prefix.slice(1));
            }
        });
    }
    return groups;
}

describe("marketplace default role pack (D142)", () => {
    it("only names permission groups that exist", async () => {
        const groups = await marketplacePermissionGroups();
        for (const role of marketplaceDefaultRoles) {
            for (const group of [...(role.permissionGroups ?? []), ...(role.readPermissionGroups ?? [])]) {
                expect(groups.has(group), `${role.slug}: ${group}`).toBe(true);
            }
        }
    }, 60000);

    it("leaves the analyst read-only over everything the operator runs", () => {
        const [operator, analyst] = marketplaceDefaultRoles;
        expect(analyst.permissionGroups).toEqual([]);
        for (const group of [...(operator.permissionGroups ?? []), ...(operator.readPermissionGroups ?? [])]) {
            expect(analyst.readPermissionGroups, group).toContain(group);
        }
    });
});
