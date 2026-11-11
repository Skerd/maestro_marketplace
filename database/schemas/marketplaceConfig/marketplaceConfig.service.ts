import {ObjectId} from "mongodb";
import {BaseCrudService, CrudOptions} from "@coreModule/database/services/baseCrudService";
import Currency from "@coreModule/database/schemas/currency/currency";
import {apiValidationException} from "armonia/src/modules/core/helpers/exceptions";
import type {CurrencySimple} from "armonia/src/modules/core/dto/currency.dto";
import {currencyService} from "@coreModule/database/schemas/currency/currency.service";
import {CurrencySimpleSnippet} from "@coreModule/database/schemas/currency/currency.snippets";
import {mapSnippet, nestedEntityToRef} from "@coreModule/utilities/mappers/common.mapper";
import MarketplaceConfig, {IMarketplaceConfig} from "./marketplaceConfig";

/** The company's own first currency: another company's would price this company's services in it. */
async function firstCurrencyOf(companyId: ObjectId, options: CrudOptions): Promise<ObjectId | undefined> {
    const currency = await Currency.findOne({company: companyId}).sort({createdAt: 1}).select("_id").session(options.session ?? null);
    return currency?._id;
}

export class MarketplaceConfigService extends BaseCrudService<IMarketplaceConfig, typeof MarketplaceConfig> {
    constructor() {
        super(MarketplaceConfig, "MarketplaceConfig");
    }

    /** The marketplace currency, with its own decimals (D90); undefined while the config names none. */
    async currencyOf(config: IMarketplaceConfig, languageCode: string): Promise<CurrencySimple | undefined> {
        const id = nestedEntityToRef(config.currency);
        const found = id ? await currencyService.findById(id, {languageCode}, undefined, "name symbol abbreviation decimalPlaces") : null;
        return mapSnippet<CurrencySimple>()(found, CurrencySimpleSnippet);
    }

    /** The company's marketplace settings, or null when the company never set them up. */
    async findForCompany(companyId: ObjectId, options: CrudOptions = {}): Promise<IMarketplaceConfig | null> {
        return this.findOne({company: companyId}, {...options, withDeleted: false});
    }

    /**
     * The company's marketplace settings, created with defaults (not listed on the portal, the
     * company's first currency) the first time they are needed.
     */
    async getOrCreateForCompany(companyId: ObjectId, options: CrudOptions = {}): Promise<IMarketplaceConfig> {
        const existing = await this.findForCompany(companyId, options);
        if (existing) return existing;

        const currency = await firstCurrencyOf(companyId, options);
        if (!currency) {
            throw apiValidationException("marketplace_currency_not_configured", "", null, options.languageCode ?? "en-US");
        }

        try {
            return await this.create({company: companyId, currency}, options);
        } catch (err: unknown) {
            // Race: another request created the singleton — re-read.
            const raced = await this.findForCompany(companyId, options);
            if (raced) return raced;
            throw err;
        }
    }

    /**
     * The marketplace currency as a reference, the default for a new record priced without one (UX-06). Before the
     * settings exist it is the currency they would start with; undefined when the company has no currency at all.
     */
    async currencyRefOf(companyId: ObjectId, options: CrudOptions = {}): Promise<ObjectId | undefined> {
        const config = await this.findForCompany(companyId, options);
        return (config ? nestedEntityToRef(config.currency) : undefined) ?? firstCurrencyOf(companyId, options);
    }
}

export const marketplaceConfigService = new MarketplaceConfigService();
