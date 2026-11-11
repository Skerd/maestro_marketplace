import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";

// The portal lists only companies of an enabled module, whatever the local `.env` enables.
vi.hoisted(() => {
    process.env.ENABLED_MODULES = "core,finance,marketplace";
});
import {connectTestDatabase, disconnectTestDatabase} from "@coreModule/_tests/testDatabase";

import {ObjectId} from "mongodb";
import Company from "@coreModule/database/schemas/company/company";
import Currency from "@coreModule/database/schemas/currency/currency";
import {asCrossTenant} from "@coreModule/utilities/endpoints/tenantScope";
import MarketplaceConfig from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig";
import {marketplaceConfigService} from "@marketplaceModule/database/schemas/marketplaceConfig/marketplaceConfig.service";
import {marketplacePortalCompanyIds} from "@marketplaceModule/utilities/shop/marketplaceSellers";

const listed = new ObjectId();
const unlisted = new ObjectId();
const withoutCurrency = new ObjectId();
const acrossCompanies = <T>(fn: () => PromiseLike<T>): Promise<T> => asCrossTenant("test fixtures span companies", fn);

beforeAll(async () => {
    await connectTestDatabase();
    await MarketplaceConfig.init();
}, 120000);

afterAll(async () => {
    await disconnectTestDatabase();
});

beforeEach(() => acrossCompanies(async () => {
    await Promise.all([MarketplaceConfig, Currency, Company].map((model) => model.collection.deleteMany({})));
    const company = (_id: ObjectId, name: string) => ({_id, name, vat: `VAT-${name}`, isActive: true, modules: ["marketplace"], deletedAt: null});
    await Company.collection.insertMany([company(listed, "Listed"), company(unlisted, "Unlisted"), company(withoutCurrency, "Bare")]);
}));

describe("the marketplace currency (D142)", () => {
    it("is the settings' currency, and before the settings exist the company's own first one", () => acrossCompanies(async () => {
        const lek = await Currency.create({name: "Lek", symbol: "L", abbreviation: "ALL", decimalPlaces: 2, company: listed});
        const euro = await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: listed});
        await Currency.create({name: "Franc", symbol: "CHF", abbreviation: "CHF", decimalPlaces: 2, company: unlisted});

        expect(String(await marketplaceConfigService.currencyRefOf(listed))).toBe(lek._id.toString());
        expect(await MarketplaceConfig.countDocuments({})).toBe(0);

        const config = await marketplaceConfigService.getOrCreateForCompany(listed, {languageCode: "en-US"});
        expect([String(config.currency), config.listedOnPortal]).toEqual([lek._id.toString(), false]);
        await MarketplaceConfig.updateOne({_id: config._id}, {$set: {currency: euro._id}});
        expect(String(await marketplaceConfigService.currencyRefOf(listed))).toBe(euro._id.toString());
    }));

    it("is missing for a company with no currency of its own, and its settings cannot start", () => acrossCompanies(async () => {
        await Currency.create({name: "Euro", symbol: "€", abbreviation: "EUR", decimalPlaces: 2, company: listed});

        expect(await marketplaceConfigService.currencyRefOf(withoutCurrency)).toBeUndefined();
        await expect(marketplaceConfigService.getOrCreateForCompany(withoutCurrency, {languageCode: "en-US"}))
            .rejects.toMatchObject({error_code: "marketplace_currency_not_configured"});
    }));
});

describe("which companies the portal's services section shows (D142)", () => {
    it("lists on the apex only the companies whose settings opt in, and shows any company on its own site", () => acrossCompanies(async () => {
        const currency = new ObjectId();
        await MarketplaceConfig.collection.insertMany([
            {company: listed, currency, listedOnPortal: true, deletedAt: null},
            {company: unlisted, currency, listedOnPortal: false, deletedAt: null},
        ]);

        expect((await marketplacePortalCompanyIds({})).map(String)).toEqual([listed.toString()]);
        expect((await marketplacePortalCompanyIds({companyId: unlisted})).map(String)).toEqual([unlisted.toString()]);
        // A company that never opened its settings still shows its services on its own site.
        expect((await marketplacePortalCompanyIds({companyId: withoutCurrency})).map(String)).toEqual([withoutCurrency.toString()]);
    }));
});
