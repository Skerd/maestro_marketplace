import * as crypto from "crypto";
import dayjs from "dayjs";
import { Document, model, Schema, SchemaTypes } from "mongoose";
import { IMedia } from "@coreModule/database/schemas/media/media";
import { IUser } from "@coreModule/database/schemas/user/user";
import { ICurrency } from "@coreModule/database/schemas/currency/currency";
import { normalizeSchemaPermissions } from "@coreModule/database/utilities";
import { COLUMN_TYPE } from "armonia/src/modules/core/database/filter/typeOperators";
import ownershipPlugin from "@coreModule/database/plugins/ownershipPlugin";
import publicMediaPlugin from "@coreModule/database/plugins/publicMediaPlugin";
import auditPlugin from "@coreModule/database/plugins/auditPlugin";
import softDeletePlugin from "@coreModule/database/plugins/softDeletePlugin";
import {
    ILifeCyclePluginFields,
    IOwnershipPluginFields,
    ISoftDeletePluginFields
} from "@coreModule/database/types/plugin-fields";
import { addModelData } from "@coreModule/database/collections";
import { CurrencySimpleSnippet } from "@coreModule/database/schemas/currency/currency.snippets";
import { CountrySimpleSnippet } from "@coreModule/database/schemas/country/country.snippets";
import { StateSimpleSnippet } from "@coreModule/database/schemas/state/state.snippets";
import { CitySimpleSnippet } from "@coreModule/database/schemas/city/city.snippets";
import { MediaSimpleSnippet } from "@coreModule/database/schemas/media/media.snippets";
import { SimpleUserSnippet } from "@coreModule/database/schemas/user/user.snippets";
import { ListingCategorySimpleSnippet } from "@marketplaceModule/database/schemas/listingCategory/listingCategory.snippets";
import { PromotionSimpleSnippet } from "@marketplaceModule/database/schemas/promotion/promotion.snippets";
import { ListingPackageSimpleSnippet } from "@marketplaceModule/database/schemas/listingPackage/listingPackage.snippets";
import { ListingAddOnSimpleSnippet } from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn.snippets";
import {validateSchemaDefAgainstMongoose} from "@coreModule/database/utilities/validateSchemaDefAgainstMongoose";
import {ListingSchemaDef} from "armonia/src/modules/marketplace/api/marketplace/private/listing/listing.schema-def";
import { applyListingIndexes } from "./listing.indexes";
import { listingViews } from "./listing.views";
import {ICountry} from "@coreModule/database/schemas/country/country";
import {IState} from "@coreModule/database/schemas/state/state";
import {ICity} from "@coreModule/database/schemas/city/city";
import {IListingCategory} from "@marketplaceModule/database/schemas/listingCategory/listingCategory";
import type {IListingPackage} from "@marketplaceModule/database/schemas/listingPackage/listingPackage";
import type {IListingAddOn} from "@marketplaceModule/database/schemas/listingAddOn/listingAddOn";
import type {IPromotion} from "@marketplaceModule/database/schemas/promotion/promotion";
import lifeCyclePlugin from "@coreModule/database/plugins/lifeCyclePlugin";

export type ListingStatus = "draft" | "active" | "inactive";
export type PricingType = "fixed" | "hourly";

export interface IListing extends Document, IOwnershipPluginFields, ISoftDeletePluginFields, ILifeCyclePluginFields {
    name: string;
    title: string;
    description?: string;
    category: IListingCategory;
    provider: IUser;
    price?: number;
    priceCurrency?: ICurrency;
    pricingType?: PricingType;
    deliveryDays?: number;
    address?: {
        country?: ICountry,
        state?: IState,
        city?: ICity
    };
    status?: ListingStatus;
    mainImage: IMedia;
    imageGallery?: IMedia[];
    videoGallery?: IMedia[];
    faqs?: { question: string; answer: string }[];
    requirements?: string[];
    tags?: string[];
    promotions?: IPromotion[];
    listingPackages?: IListingPackage[];
    listingAddOns?: IListingAddOn[];
    avgRating?: number;
    reviewCount?: number;
}

const ListingSchema = new Schema<IListing>(
    {
        name: {
            type: SchemaTypes.String,
            trim: true,
            immutable: true,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            // The LIST-… code is a badge on the sheet; the table leads with the title (UX-12).
            dynamicTableConfiguration: {hideColumn: true},
        },
        title: {
            type: SchemaTypes.String,
            required: true,
            trim: true,
        },
        description: {
            type: SchemaTypes.String,
            default: "",
            dynamicTableConfiguration: {hideColumn: true},
        },
        category: {
            type: SchemaTypes.ObjectId,
            ref: "ListingCategory",
            required: true,
            refAllowlist: ListingCategorySimpleSnippet,
        },
        provider: {
            type: SchemaTypes.ObjectId,
            ref: "User",
            required: true,
            refAllowlist: SimpleUserSnippet,
        },
        price: {
            type: SchemaTypes.Number,
        },
        priceCurrency: {
            type: SchemaTypes.ObjectId,
            ref: "Currency",
            refAllowlist: CurrencySimpleSnippet,
            dynamicTableConfiguration: {hideColumn: true},
        },
        status: {
            type: SchemaTypes.String,
            enum: ["draft", "active", "inactive"],
            default: "draft",
            required: true,
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            },
            dynamicTableConfiguration: {
                enumTones: {
                    draft:      "neutral",
                    active:     "success",
                    inactive:   "neutral",
                },
            },
        },
        pricingType: {
            type: SchemaTypes.String,
            enum: ["fixed", "hourly"],
        },
        deliveryDays: {
            type: SchemaTypes.Number,
        },
        address: {
            type: {
                country: {
                    type: SchemaTypes.ObjectId,
                    ref: "Country",
                    refAllowlist: CountrySimpleSnippet,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                state: {
                    type: SchemaTypes.ObjectId,
                    ref: "State",
                    refAllowlist: StateSimpleSnippet,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
                city: {
                    type: SchemaTypes.ObjectId,
                    ref: "City",
                    refAllowlist: CitySimpleSnippet,
                    dynamicTableConfiguration: {
                        hideColumn: true,
                    },
                },
            },
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                cellType: COLUMN_TYPE.ADDRESS,
            },
            required: false,
        },
        mainImage: {
            type: SchemaTypes.ObjectId,
            ref: "Media",
            required: true,
            refAllowlist: MediaSimpleSnippet,
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                cellType: COLUMN_TYPE.AVATAR,
            },
        },
        imageGallery: {
            type: [
                {
                    type: SchemaTypes.ObjectId,
                    ref: "Media",
                },
            ],
            default: [],
            refAllowlist: MediaSimpleSnippet,
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                cellType: COLUMN_TYPE.AVATAR,
            },
        },
        videoGallery: {
            type: [
                {
                    type: SchemaTypes.ObjectId,
                    ref: "Media",
                },
            ],
            refAllowlist: MediaSimpleSnippet,
            default: [],
            dynamicTableConfiguration: {
                filterable: false,
            },
        },
        faqs: {
            type: [
                {
                    question: {
                        type: SchemaTypes.String,
                        required: true
                    },
                    answer: {
                        type: SchemaTypes.String,
                        required: true
                    },
                },
            ],
            default: [],
            dynamicTableConfiguration: {hideColumn: true},
        },
        requirements: {
            type: [SchemaTypes.String],
            default: [],
            dynamicTableConfiguration: {hideColumn: true},
        },
        tags: {
            type: [SchemaTypes.String],
            default: [],
        },
        promotions: {
            type: [{type: SchemaTypes.ObjectId, ref: "Promotion"}],
            default: [],
            refAllowlist: PromotionSimpleSnippet,
            dynamicTableConfiguration: {
                filterable: false,
                sortable: false,
                hideColumn: true,
            },
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            }
        },
        listingPackages: {
            type: [{type: SchemaTypes.ObjectId, ref: "ListingPackage"}],
            default: [],
            refAllowlist: ListingPackageSimpleSnippet,
            /** objectId cell → badges; label from each package via refDisplayKey. */
            dynamicTableConfiguration: {
                cellType: COLUMN_TYPE.OBJECT_ID,
                refDisplayKey: ["name"],
                maxInlineItems: 1,
                filterable: false,
                sortable: false,
            },
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            }
        },
        listingAddOns: {
            type: [{type: SchemaTypes.ObjectId, ref: "ListingAddOn"}],
            default: [],
            refAllowlist: ListingAddOnSimpleSnippet,
            /** objectId cell → badges; label from each add-on via refDisplayKey. */
            dynamicTableConfiguration: {
                cellType: COLUMN_TYPE.OBJECT_ID,
                refDisplayKey: ["name"],
                maxInlineItems: 1,
                filterable: false,
                sortable: false,
            },
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            }
        },
        avgRating: {
            type: SchemaTypes.Number,
            default: 0,
            min: 0,
            max: 5,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
            },
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            }
        },
        reviewCount: {
            type: SchemaTypes.Number,
            default: 0,
            min: 0,
            dynamicTableConfiguration: {
                filterable: true,
                sortable: true,
            },
            permissions: {
                self: {write: "no-permission"},
                others: {write: "no-permission"},
            }
        },
    },
    {
        accessMode: "loose",
    }
);

ListingSchema.pre("save", function (next) {
    const listing = this as IListing;
    if (listing.isNew && !listing.name) {
        const datePart = dayjs(new Date()).format("YYYYMMDD");
        const randomPart = crypto.randomBytes(4).toString("hex");
        listing.name = `LIST-${datePart}-${randomPart}`.toUpperCase();
    }
    next();
});

ownershipPlugin(ListingSchema);
publicMediaPlugin(ListingSchema, {schemaDef: ListingSchemaDef});
auditPlugin(ListingSchema);
softDeletePlugin(ListingSchema);
lifeCyclePlugin(ListingSchema);
applyListingIndexes(ListingSchema);
const Listing = model<IListing>("Listing", ListingSchema);
export default Listing;

normalizeSchemaPermissions(Listing);
addModelData(Listing, listingViews);
validateSchemaDefAgainstMongoose(ListingSchema, ListingSchemaDef, "Listing", ["name", "status", "promotions", "listingPackages", "listingAddOns", "avgRating", "reviewCount"]);
