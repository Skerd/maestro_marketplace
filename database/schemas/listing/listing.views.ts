import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const listingSheetView: ViewConfig = {
    model: "listings",
    viewType: "sheet",
    accessModel: "listings",
    apiUrl: "/api/marketplace/listing",
    header: {
        titleField: "title",
        subtitleKey: "listingSubtitle",
        showCloseButton: true,
    },
    // UX-03 order: the status sits in the header; price and packages, then description and media, then details.
    nodes: [
        {
            // The title is the sheet title, not a card (UX-03).
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "price",
                            permissions: {read: "price"},
                            field: {
                                name: "price",
                                widget: "#DisplayCard",
                                label: "price",
                                widgetProps: {
                                    icon: "#DollarSign",
                                    format: "locale",
                                    valuePath: ["priceCurrency.symbol", "price"],
                                    joinSeparator: " ",
                                    type: "currency",
                                    linkedRefPath: "priceCurrency",
                                    linkedSheetModel: "currencies",
                                    linkedSheetWidget: "#CurrencySheetView",
                                    linkedSheetEntityProp: "priceCurrency",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "pricingType",
                            permissions: {read: "pricingType"},
                            field: {
                                name: "pricingType",
                                widget: "#DisplayCard",
                                label: "pricingType",
                                widgetProps: {icon: "#Tag", languageKeyCategory: "listingPricingType", type: "enum"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "deliveryDays",
                            permissions: {read: "deliveryDays"},
                            field: {
                                name: "deliveryDays",
                                widget: "#DisplayCard",
                                label: "deliveryDays",
                                widgetProps: {icon: "#Clock", format: "locale", valueTemplateKey: "deliveryDaysValue"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "category",
                            permissions: {read: "category"},
                            field: {
                                name: "category",
                                widget: "#DisplayCard",
                                label: "category",
                                widgetProps: {
                                    icon: "#Folder",
                                    valuePath: ["category.name"],
                                    linkedRefPath: "category",
                                    linkedSheetModel: "listingcategories",
                                    linkedSheetWidget: "#ListingCategorySheetView",
                                    linkedSheetEntityProp: "category",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "provider",
                            permissions: {read: "provider"},
                            field: {
                                name: "provider",
                                widget: "#DisplayCard",
                                label: "provider",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["provider.name", "provider.surname"],
                                    joinSeparator: " ",
                                    type: "user",
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#ReferencesViewModeScope",
            props: {
                storageKey: "listing.sheet.listingPackages.listDisplay",
                defaultMode: "compact",
            },
            children: [
                {
                    render: "#SheetGroup",
                    props: {
                        title: "listingPackages",
                        titleActions: "#ReferencesViewModeToggle",
                    },
                    dependent: "listingPackages",
                    permissions: {read: "listingPackages"},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    permissions: {read: "listingPackages"},
                                    field: {
                                        name: "listingPackages",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#ListingPackageCard",
                                            itemDataProp: "listingPackage",
                                            pageSize: 2,
                                            compactRow: {
                                                icon: "#Package",
                                                label: "listingPackage",
                                                // Named by the package, valued by its price; the sort order stays off (UX-03).
                                                labelPath: "name",
                                                valuePath: ["price.amount"],
                                                valueFormats: [{money: "price.currency"}],
                                                linkedSheetModel: "listingPackages",
                                                linkedSheetWidget: "#ListingPackageSheetView",
                                                linkedSheetEntityProp: "listingPackage",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            render: "#ReferencesViewModeScope",
            props: {
                storageKey: "listing.sheet.listingAddOns.listDisplay",
                defaultMode: "compact",
            },
            children: [
                {
                    render: "#SheetGroup",
                    props: {
                        title: "listingAddOns",
                        titleActions: "#ReferencesViewModeToggle",
                    },
                    dependent: "listingAddOns",
                    permissions: {read: "listingAddOns"},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    permissions: {read: "listingAddOns"},
                                    field: {
                                        name: "listingAddOns",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#ListingAddOnCard",
                                            itemDataProp: "listingAddOn",
                                            pageSize: 2,
                                            compactRow: {
                                                icon: "#Package",
                                                label: "listingAddOn",
                                                labelPath: "name",
                                                valuePath: ["price.amount"],
                                                valueFormats: [{money: "price.currency"}],
                                                linkedSheetModel: "listingAddOns",
                                                linkedSheetWidget: "#ListingAddOnSheetView",
                                                linkedSheetEntityProp: "listingAddOn",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        // The listing's records (listingHub), after what it sells and before its description (UX-03).
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.listing.sheet.orders.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (listingHub).
                    render: "#SheetGroup",
                    dependent: "orders",
                    dependentRuntimeOnly: true,
                    props: {title: "ordersGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "orders",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#OrderCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who ordered, when, for how much and how it stands; the order number stays on the opened sheet.
                                                icon: "#IconReceipt",
                                                label: "orderRow",
                                                labelPath: ["customer.name", "customer.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "amount", "status"],
                                                valueLanguageKeyCategories: [null, null, "orderStatus"],
                                                valueFormats: ["date", {money: "currency"}, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "orders",
                                                linkedSheetWidget: "#OrderSheetView",
                                                linkedSheetEntityProp: "order",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.listing.sheet.bookings.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (listingHub).
                    render: "#SheetGroup",
                    dependent: "bookings",
                    dependentRuntimeOnly: true,
                    props: {title: "bookingsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "bookings",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#BookingCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // When the session is, and for whom.
                                                icon: "#IconCalendarEvent",
                                                label: "bookingRow",
                                                labelPath: ["startAt", "endAt"],
                                                labelFormat: "dateTime",
                                                valuePath: ["order.customer.name", "order.customer.surname"],
                                                joinSeparator: " ",
                                                linkedSheetModel: "bookings",
                                                linkedSheetWidget: "#BookingSheetView",
                                                linkedSheetEntityProp: "booking",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.listing.sheet.reviews.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (listingHub).
                    render: "#SheetGroup",
                    dependent: "reviews",
                    dependentRuntimeOnly: true,
                    props: {title: "reviewsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "reviews",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#ReviewCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who reviewed, when, the stars and what they wrote.
                                                icon: "#IconStar",
                                                label: "reviewRow",
                                                labelPath: ["reviewer.name", "reviewer.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "rating", "comment"],
                                                valueFormats: ["date", null, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "reviews",
                                                linkedSheetWidget: "#ReviewSheetView",
                                                linkedSheetEntityProp: "review",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.listing.sheet.flags.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (listingHub).
                    render: "#SheetGroup",
                    dependent: "flags",
                    dependentRuntimeOnly: true,
                    props: {title: "flagsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "flags",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#ListingFlagCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who reported it, when, why, and whether it was dealt with.
                                                icon: "#IconFlag",
                                                label: "flagRow",
                                                labelPath: ["user.name", "user.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "reason", "status"],
                                                valueLanguageKeyCategories: [null, "listingFlagReason", "listingFlagStatus"],
                                                valueFormats: ["date", null, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "listingflags",
                                                linkedSheetWidget: "#ListingFlagSheetView",
                                                linkedSheetEntityProp: "listingFlag",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "description"},
            dependent: "description",
            permissions: {read: "description"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "description"},
                            field: {
                                name: "description",
                                widget: "#ExpandableText",
                                label: "description",
                                widgetProps: {className: "text-sm"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "gallery"},
            dependentAny: ["mainImage", "imageGallery", "videoGallery"],
            permissions: {read: "mainImage"},
            children: [
                {
                    render: "div",
                    props: {className: "max-w-full"},
                    children: [
                        {
                            render: "#GalleryCarousel",
                            permissions: {read: "mainImage"},
                            field: {
                                name: "mainImage",
                                widget: "#GalleryCarousel",
                                widgetProps: {
                                    imageGalleryField: "imageGallery",
                                    videoGalleryField: "videoGallery",
                                    showThumbnails: false,
                                    allowFullScreen: false,
                                    coverAfterFirst: false,
                                    showPreviews: true,
                                    previewLocation: "right",
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "details"},
            dependentAny: ["tags", "requirements", "address", "serviceArea"],
            permissions: {readAny: ["tags", "requirements", "address", "serviceArea"]},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    dependent: "address",
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "address.country",
                            dependentRuntimeOnly: true,
                            permissions: {read: "address"},
                            field: {
                                name: "address.country.name",
                                widget: "#DisplayCard",
                                label: "country",
                                widgetProps: {
                                    icon: "#Globe",
                                    flagCodePath: "address.country.code",
                                    linkedRefPath: "address.country",
                                    linkedSheetModel: "countries",
                                    linkedSheetWidget: "#CountrySheetView",
                                    linkedSheetEntityProp: "country",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "address.state",
                            dependentRuntimeOnly: true,
                            permissions: {read: "address"},
                            field: {
                                name: "address.state.name",
                                widget: "#DisplayCard",
                                label: "state",
                                widgetProps: {
                                    icon: "#MapPin",
                                    linkedRefPath: "address.state",
                                    linkedSheetModel: "states",
                                    linkedSheetWidget: "#StateSheetView",
                                    linkedSheetEntityProp: "state",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "address.city",
                            dependentRuntimeOnly: true,
                            permissions: {read: "address"},
                            field: {
                                name: "address.city.name",
                                widget: "#DisplayCard",
                                label: "city",
                                widgetProps: {
                                    icon: "#Building",
                                    linkedRefPath: "address.city",
                                    linkedSheetModel: "cities",
                                    linkedSheetWidget: "#CitySheetView",
                                    linkedSheetEntityProp: "city",
                                },
                            },
                        },
                    ],
                },
                {
                    render: "#SheetGrid",
                    props: {columns: 3},
                    dependent: "serviceArea",
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "serviceArea.radiusKm",
                            dependentRuntimeOnly: true,
                            permissions: {read: "serviceArea"},
                            field: {
                                name: "serviceArea.radiusKm",
                                widget: "#DisplayCard",
                                label: "serviceArea",
                                widgetProps: {icon: "#MapPin", format: "locale", valueTemplateKey: "serviceAreaValue"},
                            },
                        },
                    ],
                },
                {
                    render: "#SheetGrid",
                    props: {columns: 1},
                    dependent: "tags",
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "tags"},
                            field: {
                                name: "tags",
                                widget: "#DisplayCard",
                                label: "tags",
                                widgetProps: {icon: "#Tag", valueType: "stringBadgeList"},
                            },
                        },
                    ],
                },
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    dependent: "requirements",
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "requirements"},
                            field: {
                                name: "requirements",
                                widget: "#ExpandableText",
                                label: "requirements",
                                widgetProps: {className: "text-sm"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#ReferencesViewModeScope",
            props: {storageKey: "listing.sheet.faqs", defaultMode: "cards"},
            children: [
                {
                    render: "#SheetGroup",
                    dependent: "faqs",
                    permissions: {read: "faqs"},
                    props: {title: "faqs", titleActions: "#ReferencesViewModeToggle"},
                    children: [
                        {
                            render: "div",
                            props: {className: "space-y-2"},
                            children: [
                                {
                                    render: "#SheetEmbeddedItemsList",
                                    permissions: {read: "faqs"},
                                    field: {
                                        name: "faqs",
                                        widget: "#SheetEmbeddedItemsList",
                                        widgetProps: {
                                            fields: [
                                                {name: "question", type: "expandableText", className: "text-base font-medium ms-1"},
                                                {name: "answer", type: "expandableText", className: "text-sm"},
                                            ],
                                            compactSummaryField: "question",
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            render: "#ReferencesViewModeScope",
            props: {
                storageKey: "listing.sheet.promotions.listDisplay",
                defaultMode: "compact",
            },
            children: [
                {
                    render: "#SheetGroup",
                    props: {
                        title: "promotions",
                        titleActions: "#ReferencesViewModeToggle",
                    },
                    dependent: "promotions",
                    permissions: {read: "promotions"},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    permissions: {read: "promotions"},
                                    field: {
                                        name: "promotions",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#PromotionCard",
                                            pageSize: 2,
                                            compactRow: {
                                                icon: "#Tag",
                                                label: "promotion",
                                                valuePath: ["name", "type"],
                                                valueLanguageKeyCategories: [null, "promotionType"],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "promotions",
                                                linkedSheetWidget: "#PromotionSheetView",
                                                linkedSheetEntityProp: "promotion",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const pricingTypeOptions = [
    {value: "fixed", label: "form.pricingType.fixed"},
    {value: "hourly", label: "form.pricingType.hourly"},
];

/** Groups follow the sheet: what it is, its price, its media, then details, place and FAQs (UX-03, UX-04). */
const listingCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.general"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "title",
                            widget: "#Input",
                            label: "form.titleLabel",
                            placeholder: "form.titlePlaceholder",
                            required: true,
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "category",
                            widget: "#ApiSelect",
                            label: "form.categoryLabel",
                            placeholder: "form.categoryPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/marketplace/listingCategory/select"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "provider",
                            widget: "#ApiSelect",
                            label: "form.providerLabel",
                            placeholder: "form.providerPlaceholder",
                            required: true,
                            widgetProps: {
                                apiUrl: "/api/company/users/select",
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                ],
            },
            {
                render: "#Field",
                field: {
                    name: "description",
                    widget: "#Textarea",
                    label: "form.descriptionLabel",
                    placeholder: "form.descriptionPlaceholder",
                    widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.pricing"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 4},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "priceCurrency",
                            widget: "#ApiSelect",
                            label: "form.priceCurrencyLabel",
                            placeholder: "form.priceCurrencyPlaceholder",
                            widgetProps: {apiUrl: "/api/finance/currency/select"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "price",
                            widget: "#Input",
                            label: "form.priceLabel",
                            placeholder: "form.pricePlaceholder",
                            widgetProps: {type: "number", min: 0, step: "any"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "pricingType",
                            widget: "#SimpleSelect",
                            label: "form.pricingTypeLabel",
                            placeholder: "form.pricingTypePlaceholder",
                            widgetProps: {options: pricingTypeOptions, className: "grow w-full"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "deliveryDays",
                            widget: "#Input",
                            label: "form.deliveryDaysLabel",
                            placeholder: "form.deliveryDaysPlaceholder",
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.images"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "mainImage",
                            widget: "#MediaField",
                            label: "form.mainImageLabel",
                            widgetProps: {mediaType: "image", mode: "single"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "imageGallery",
                            widget: "#MediaField",
                            label: "form.imageGalleryLabel",
                            widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.video"},
        children: [
            {
                render: "#Field",
                field: {
                    name: "videoGallery",
                    widget: "#MediaField",
                    label: "form.videoGalleryLabel",
                    widgetProps: {mediaType: "video", mode: "multiple", maxCount: 3},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.details"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "tags",
                            widget: "#StringArrayInput",
                            label: "form.tagsLabel",
                            placeholder: "form.tagsPlaceholder",
                            widgetProps: {removeTooltipKey: "form.tagsRemoveTooltip", maxItems: 50},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "requirements",
                            widget: "#StringArrayInput",
                            label: "form.requirementsLabel",
                            placeholder: "form.requirementsPlaceholder",
                            widgetProps: {removeTooltipKey: "form.requirementsRemoveTooltip", maxItems: 50},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.location"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "address.country",
                            widget: "#ApiSelect",
                            label: "form.addressCountryLabel",
                            placeholder: "form.addressCountryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/country/select",
                                pageSize: 50,
                                cascadeClearFormFields: ["address.state", "address.city"],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.state",
                            widget: "#ApiSelect",
                            label: "form.addressStateLabel",
                            placeholder: "form.addressStatePlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/state/select",
                                pageSize: 50,
                                postBodyFromFormFields: [
                                    {field: "address.country", paramName: "country"},
                                ],
                                enableWhenFormFieldsNonEmpty: ["address.country"],
                                cascadeClearFormFields: ["address.city"],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "address.city",
                            widget: "#ApiSelect",
                            label: "form.addressCityLabel",
                            placeholder: "form.addressCityPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/city/select",
                                pageSize: 50,
                                postBodyFromFormFields: [
                                    {field: "address.country", paramName: "country"},
                                    {field: "address.state", paramName: "state"},
                                ],
                                enableWhenFormFieldsNonEmpty: ["address.country"],
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.serviceArea"},
        children: [
            {render: "#FormAlert", props: {message: "form.serviceAreaHint"}},
            {
                render: "#FormGrid",
                props: {columns: 3, className: "gap-6"},
                children: [
                    {
                        render: "div",
                        props: {className: "lg:col-span-1 space-y-6 min-w-0"},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "serviceArea.radiusKm",
                                    widget: "#Input",
                                    label: "form.serviceAreaRadiusLabel",
                                    placeholder: "form.serviceAreaRadiusPlaceholder",
                                    widgetProps: {type: "number", min: 1, max: 300, step: 1},
                                },
                            },
                        ],
                    },
                    {
                        render: "div",
                        props: {className: "flex flex-col lg:col-span-2 w-full min-h-[220px] h-[260px]"},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "_serviceAreaMap",
                                    widget: "#FormMapPinPicker",
                                    skipWriteAccessGate: true,
                                    widgetProps: {fieldPrefix: "serviceArea", latField: "latitude", lngField: "longitude"},
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        render: "#Field",
        field: {
            name: "faqs",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.faqsSectionTitle",
                arrayField: "faqs",
                defaultItem: {question: "", answer: ""},
                addLabel: "form.faqAddRow",
                removeLabel: "form.faqRemoveRow",
                rowTitleFields: ["question"],
                rowTitlePlaceholder: "form.faqRowTitle",
                rowTemplate: [
                    {
                        render: "div",
                        props: {className: "space-y-4"},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "question",
                                    widget: "#Input",
                                    label: "form.faqQuestionLabel",
                                    placeholder: "form.faqQuestionPlaceholder",
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "answer",
                                    widget: "#Textarea",
                                    label: "form.faqAnswerLabel",
                                    placeholder: "form.faqAnswerPlaceholder",
                                    widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"},
                                },
                            },
                        ],
                    },
                ],
            },
        },
    },
];

const listingEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.general"},
        permissions: {
            readAny: ["title", "category", "provider", "description"],
            writeAny: ["title", "category", "provider", "description"],
        },
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "title", write: "title"},
                        field: {
                            name: "title",
                            widget: "#Input",
                            label: "form.titleLabel",
                            placeholder: "form.titlePlaceholder",
                            required: true,
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "category", write: "category"},
                        field: {
                            name: "category",
                            widget: "#ApiSelect",
                            label: "form.categoryLabel",
                            placeholder: "form.categoryPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/marketplace/listingCategory/select"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "provider", write: "provider"},
                        field: {
                            name: "provider",
                            widget: "#ApiSelect",
                            label: "form.providerLabel",
                            placeholder: "form.providerPlaceholder",
                            required: true,
                            widgetProps: {
                                apiUrl: "/api/company/users/select",
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                ],
            },
            {
                render: "#Field",
                permissions: {read: "description", write: "description"},
                field: {
                    name: "description",
                    widget: "#Textarea",
                    label: "form.descriptionLabel",
                    placeholder: "form.descriptionPlaceholder",
                    widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.pricing"},
        permissions: {
            readAny: ["priceCurrency", "price", "pricingType", "deliveryDays"],
            writeAny: ["priceCurrency", "price", "pricingType", "deliveryDays"],
        },
        children: [
            {
                render: "#FormGrid",
                props: {columns: 4},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "priceCurrency", write: "priceCurrency"},
                        field: {
                            name: "priceCurrency",
                            widget: "#ApiSelect",
                            label: "form.priceCurrencyLabel",
                            placeholder: "form.priceCurrencyPlaceholder",
                            widgetProps: {apiUrl: "/api/finance/currency/select"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "price", write: "price"},
                        field: {
                            name: "price",
                            widget: "#Input",
                            label: "form.priceLabel",
                            placeholder: "form.pricePlaceholder",
                            widgetProps: {type: "number", min: 0, step: "any"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "pricingType", write: "pricingType"},
                        field: {
                            name: "pricingType",
                            widget: "#SimpleSelect",
                            label: "form.pricingTypeLabel",
                            placeholder: "form.pricingTypePlaceholder",
                            widgetProps: {options: pricingTypeOptions, className: "grow w-full"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "deliveryDays", write: "deliveryDays"},
                        field: {
                            name: "deliveryDays",
                            widget: "#Input",
                            label: "form.deliveryDaysLabel",
                            placeholder: "form.deliveryDaysPlaceholder",
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.images"},
        permissions: {readAny: ["mainImage", "imageGallery"], writeAny: ["mainImage", "imageGallery"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "mainImage", write: "mainImage"},
                        field: {
                            name: "mainImage",
                            widget: "#MediaField",
                            label: "form.mainImageLabel",
                            widgetProps: {mediaType: "image", mode: "single"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "imageGallery", write: "imageGallery"},
                        field: {
                            name: "imageGallery",
                            widget: "#MediaField",
                            label: "form.imageGalleryLabel",
                            widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.video"},
        permissions: {readAny: ["videoGallery"], writeAny: ["videoGallery"]},
        children: [
            {
                render: "#Field",
                permissions: {read: "videoGallery", write: "videoGallery"},
                field: {
                    name: "videoGallery",
                    widget: "#MediaField",
                    label: "form.videoGalleryLabel",
                    widgetProps: {mediaType: "video", mode: "multiple", maxCount: 3},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.details"},
        permissions: {readAny: ["tags", "requirements"], writeAny: ["tags", "requirements"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "tags", write: "tags"},
                        field: {
                            name: "tags",
                            widget: "#StringArrayInput",
                            label: "form.tagsLabel",
                            placeholder: "form.tagsPlaceholder",
                            widgetProps: {removeTooltipKey: "form.tagsRemoveTooltip", maxItems: 50},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "requirements", write: "requirements"},
                        field: {
                            name: "requirements",
                            widget: "#StringArrayInput",
                            label: "form.requirementsLabel",
                            placeholder: "form.requirementsPlaceholder",
                            widgetProps: {removeTooltipKey: "form.requirementsRemoveTooltip", maxItems: 50},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.location"},
        permissions: {readAny: ["address"], writeAny: ["address"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "address", write: "address"},
                        field: {
                            name: "address.country",
                            widget: "#ApiSelect",
                            label: "form.addressCountryLabel",
                            placeholder: "form.addressCountryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/country/select",
                                pageSize: 50,
                                cascadeClearFormFields: ["address.state", "address.city"],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "address", write: "address"},
                        field: {
                            name: "address.state",
                            widget: "#ApiSelect",
                            label: "form.addressStateLabel",
                            placeholder: "form.addressStatePlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/state/select",
                                pageSize: 50,
                                postBodyFromFormFields: [
                                    {field: "address.country", paramName: "country"},
                                ],
                                enableWhenFormFieldsNonEmpty: ["address.country"],
                                cascadeClearFormFields: ["address.city"],
                            },
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "address", write: "address"},
                        field: {
                            name: "address.city",
                            widget: "#ApiSelect",
                            label: "form.addressCityLabel",
                            placeholder: "form.addressCityPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/auxiliary/city/select",
                                pageSize: 50,
                                postBodyFromFormFields: [
                                    {field: "address.country", paramName: "country"},
                                    {field: "address.state", paramName: "state"},
                                ],
                                enableWhenFormFieldsNonEmpty: ["address.country"],
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.serviceArea"},
        permissions: {readAny: ["serviceArea"], writeAny: ["serviceArea"]},
        children: [
            {render: "#FormAlert", props: {message: "form.serviceAreaHint"}},
            {
                render: "#FormGrid",
                props: {columns: 3, className: "gap-6"},
                children: [
                    {
                        render: "div",
                        props: {className: "lg:col-span-1 space-y-6 min-w-0"},
                        children: [
                            {
                                render: "#Field",
                                permissions: {read: "serviceArea", write: "serviceArea"},
                                field: {
                                    name: "serviceArea.radiusKm",
                                    widget: "#Input",
                                    label: "form.serviceAreaRadiusLabel",
                                    placeholder: "form.serviceAreaRadiusPlaceholder",
                                    widgetProps: {type: "number", min: 1, max: 300, step: 1},
                                },
                            },
                        ],
                    },
                    {
                        render: "div",
                        props: {className: "flex flex-col lg:col-span-2 w-full min-h-[220px] h-[260px]"},
                        children: [
                            {
                                render: "#Field",
                                permissions: {read: "serviceArea", write: "serviceArea"},
                                field: {
                                    name: "_serviceAreaMap",
                                    widget: "#FormMapPinPicker",
                                    skipWriteAccessGate: true,
                                    widgetProps: {fieldPrefix: "serviceArea", latField: "latitude", lngField: "longitude"},
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
    {
        render: "#Field",
        permissions: {read: "faqs", write: "faqs"},
        field: {
            name: "faqs",
            widget: "#FormRepeater",
            widgetProps: {
                title: "form.faqsSectionTitle",
                arrayField: "faqs",
                defaultItem: {question: "", answer: ""},
                addLabel: "form.faqAddRow",
                removeLabel: "form.faqRemoveRow",
                rowTitleFields: ["question"],
                rowTitlePlaceholder: "form.faqRowTitle",
                rowTemplate: [
                    {
                        render: "div",
                        props: {className: "space-y-4"},
                        children: [
                            {
                                render: "#Field",
                                field: {
                                    name: "question",
                                    widget: "#Input",
                                    label: "form.faqQuestionLabel",
                                    placeholder: "form.faqQuestionPlaceholder",
                                },
                            },
                            {
                                render: "#Field",
                                field: {
                                    name: "answer",
                                    widget: "#Textarea",
                                    label: "form.faqAnswerLabel",
                                    placeholder: "form.faqAnswerPlaceholder",
                                    widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"},
                                },
                            },
                        ],
                    },
                ],
            },
        },
    },
];


export const listingCreateFormView: ViewConfig = {
    model: "listings",
    viewType: "form",
    viewMode: "create",
    accessModel: "listings",
    apiUrl: "/api/marketplace/listing",
    method: "PUT",
    nodes: listingCreateFormNodes,
};

export const listingEditFormView: ViewConfig = {
    model: "listings",
    viewType: "form",
    viewMode: "edit",
    accessModel: "listings",
    apiUrl: "/api/marketplace/listing",
    method: "PATCH",
    nodes: listingEditFormNodes,
};

export const listingViews: ViewConfig[] = [listingSheetView, listingCreateFormView, listingEditFormView];
