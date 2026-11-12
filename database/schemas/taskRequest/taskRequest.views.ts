import type { ViewConfig } from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const taskRequestSheetView: ViewConfig = {
    model: "taskrequests",
    viewType: "sheet",
    accessModel: "taskRequests",
    apiUrl: "/api/marketplace/taskRequest",
    header: {
        titleField: "title",
        subtitleKey: "taskRequest",
        showCloseButton: true,
    },
    nodes: [
        {
            render: "#SheetGroup",
            props: { title: "section.generalInfo" },
            children: [
                {
                    render: "#SheetGrid",
                    props: { columns: 2 },
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: { read: "category" },
                            field: {
                                name: "category",
                                widget: "#DisplayCard",
                                label: "category",
                                widgetProps: {
                                    icon: "#Folder",
                                    valuePath: ["category.name"],
                                    linkedRefPath: "category",
                                    linkedSheetModel: "listingCategories",
                                    linkedSheetWidget: "#CategorySheetView",
                                    linkedSheetEntityProp: "category",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: { read: "requester" },
                            field: {
                                name: "requester",
                                widget: "#DisplayCard",
                                label: "requester",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["requester.name", "requester.surname"],
                                    joinSeparator: " ",
                                    linkedRefPath: "requester",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "budgetMax",
                            permissions: { read: "budgetMax" },
                            field: {
                                name: "budgetMax",
                                widget: "#DisplayCard",
                                label: "budgetMax",
                                widgetProps: {
                                    icon: "#DollarSign",
                                    format: "locale",
                                    valuePath: ["currency.symbol", "budgetMax"],
                                    joinSeparator: " ",
                                    type: "currency",
                                    linkedRefPath: "currency",
                                    linkedSheetModel: "currencies",
                                    linkedSheetWidget: "#CurrencySheetView",
                                    linkedSheetEntityProp: "currency",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: { read: "expiresAt" },
                            field: {
                                name: "expiresAt",
                                widget: "#DisplayCard",
                                label: "expiresAt",
                                widgetProps: { icon: "#Calendar", format: "date", type: "date" },
                            },
                        },
                    ],
                },
            ],
        },

        // Its bids and the order it led to (taskRequestHub), after the request's facts and before its text (UX-03).
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.taskRequest.sheet.bids.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (taskRequestHub).
                    render: "#SheetGroup",
                    dependent: "bids",
                    dependentRuntimeOnly: true,
                    props: {title: "bidsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "bids",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#BidCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who bid, when, the offered amount and how it stands.
                                                icon: "#IconCoin",
                                                label: "bidRow",
                                                labelPath: ["bidder.name", "bidder.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "amount", "status"],
                                                valueLanguageKeyCategories: [null, null, "bidStatus"],
                                                valueFormats: ["date", {money: "currency"}, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "marketplacebids",
                                                linkedSheetWidget: "#BidSheetView",
                                                linkedSheetEntityProp: "bid",
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
            props: {storageKey: "marketplace.taskRequest.sheet.orders.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (taskRequestHub).
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
                                                // Who does the job, since when, for how much and how it stands.
                                                icon: "#IconReceipt",
                                                label: "orderRow",
                                                labelPath: ["provider.name", "provider.surname"],
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
            render: "#SheetGroup",
            dependent: "description",
            props: { title: "description" },
            children: [
                {
                    render: "div",
                    props: { className: "p-2 rounded-lg bg-muted/30 border border-border/50" },
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: { read: "description" },
                            field: {
                                name: "description",
                                widget: "#ExpandableText",
                                widgetProps: { className: "text-sm" },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: { title: "gallery" },
            permissions: { read: "mainImage" },
            children: [
                {
                    render: "div",
                    props: { className: "max-w-full" },
                    children: [
                        {
                            render: "#GalleryCarousel",
                            permissions: { read: "mainImage" },
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
            props: { title: "address" },
            children: [
                {
                    render: "div",
                    props: { className: "space-y-2" },
                    children: [
                        {
                            render: "#SheetGrid",
                            props: { columns: 3 },
                            children: [
                                {
                                    render: "#DisplayCard",
                                    permissions: { read: "address" },
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
                                    permissions: { read: "address" },
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
                                    permissions: { read: "address" },
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
                            props: { columns: 2 },
                            children: [
                                {
                                    render: "#DisplayCard",
                                    permissions: { read: "address" },
                                    field: {
                                        name: "address.street",
                                        widget: "#DisplayCard",
                                        label: "street",
                                        widgetProps: { icon: "#MapPin" },
                                    },
                                },
                                {
                                    render: "#DisplayCard",
                                    permissions: { read: "address" },
                                    field: {
                                        name: "address.postalCode",
                                        widget: "#DisplayCard",
                                        label: "postalCode",
                                        widgetProps: { icon: "#Mail" },
                                    },
                                },
                            ],
                        },
                        {
                            render: "div",
                            props: { className: "w-full pt-2" },
                            children: [
                                {
                                    render: "#SheetLocationMap",
                                    permissions: { read: "address" },
                                    field: {
                                        name: "address",
                                        widget: "#SheetLocationMap",
                                        widgetProps: {
                                            latitudeField: "address.latitude",
                                            longitudeField: "address.longitude",
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

// Separate create and edit trees (VC-02): edit carries the field ACL; create carries none.
const taskRequestCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.general"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {name: "title", widget: "#Input", label: "form.titleLabel", placeholder: "form.titlePlaceholder", required: true},
                    },
                    {
                        render: "#Field",
                        field: {name: "category", widget: "#ApiSelect", label: "form.categoryLabel", placeholder: "form.categoryPlaceholder", required: true, widgetProps: {apiUrl: "/api/marketplace/listingCategory/select"}},
                    },
                ],
            },
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {name: "description", widget: "#Textarea", label: "form.descriptionLabel", placeholder: "form.descriptionPlaceholder", widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"}},
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.budget"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        field: {name: "currency", widget: "#ApiSelect", label: "form.currencyLabel", placeholder: "form.currencyPlaceholder", description: "form.currencyDescription", required: true, widgetProps: {apiUrl: "/api/finance/currency/select"}},
                    },
                    {
                        render: "#Field",
                        field: {name: "budgetMax", widget: "#Input", label: "form.budgetMaxLabel", placeholder: "form.budgetMaxPlaceholder", description: "form.budgetMaxDescription", required: false, widgetProps: {type: "number", min: 1, step: "any"}},
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.address"},
        children: [
            {
                render: "div",
                props: {className: "grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch"},
                children: [
                    {
                        render: "div",
                        props: {className: "lg:col-span-2 space-y-6 min-w-0"},
                        children: [
                            {
                                render: "#FormGrid",
                                props: {columns: 3, className: "gap-6"},
                                children: [
                                    {
                                        render: "#Field",
                                        field: {
                                            name: "address.country",
                                            widget: "#ApiSelect",
                                            label: "form.countryLabel",
                                            placeholder: "form.countryPlaceholder",
                                            required: true,
                                            widgetProps: {
                                                apiUrl: "/api/auxiliary/country/select",
                                                method: "POST",
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
                                            label: "form.stateLabel",
                                            placeholder: "form.statePlaceholder",
                                            widgetProps: {
                                                apiUrl: "/api/auxiliary/state/select",
                                                method: "POST",
                                                pageSize: 50,
                                                postBodyFromFormFields: [{field: "address.country", paramName: "country"}],
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
                                            label: "form.cityLabel",
                                            placeholder: "form.cityPlaceholder",
                                            required: true,
                                            widgetProps: {
                                                apiUrl: "/api/auxiliary/city/select",
                                                method: "POST",
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
                            {
                                render: "#FormGrid",
                                props: {columns: 2, className: "gap-6"},
                                children: [
                                    {
                                        render: "#Field",
                                        field: {name: "address.street", widget: "#Input", label: "form.streetLabel", placeholder: "form.streetPlaceholder", required: true},
                                    },
                                    {
                                        render: "#Field",
                                        field: {name: "address.postalCode", widget: "#Input", label: "form.postalCodeLabel", placeholder: "form.postalCodePlaceholder", required: true},
                                    },
                                ],
                            },
                            {render: "#FormAlert", props: {message: "form.addressPrivacyAlert"}},
                        ],
                    },
                    {
                        render: "div",
                        props: {className: "flex flex-col lg:col-span-1 w-full min-h-[220px] h-[220px] lg:h-full lg:min-h-[220px]"},
                        children: [
                        {
                            render: "#Field",
                            field: {
                                    name: "_addressMap",
                                    widget: "#FormMapPinPicker",
                                    skipWriteAccessGate: true,
                                    widgetProps: {fieldPrefix: "address", latField: "latitude", lngField: "longitude"},
                                },
                        },
                        ],
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
                        field: {name: "mainImage", widget: "#MediaField", label: "form.mainImageLabel", required: true, widgetProps: {mediaType: "image", mode: "single"}},
                    },
                    {
                        render: "#Field",
                        field: {name: "imageGallery", widget: "#MediaField", label: "form.imageGalleryLabel", widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8}},
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.video", defaultOpen: false},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {name: "videoGallery", widget: "#MediaField", label: "form.videoGalleryLabel", widgetProps: {mediaType: "video", mode: "multiple", maxCount: 3}},
                    },
                ],
            },
        ],
    },
];

const taskRequestEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.general"},
        permissions: {readAny: ["title", "category", "description"], writeAny: ["title", "category", "description"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "title", write: "title"},
                        field: {name: "title", widget: "#Input", label: "form.titleLabel", placeholder: "form.titlePlaceholder", required: true},
                    },
                    {
                        render: "#Field",
                        permissions: {read: "category", write: "category"},
                        field: {name: "category", widget: "#ApiSelect", label: "form.categoryLabel", placeholder: "form.categoryPlaceholder", required: true, widgetProps: {apiUrl: "/api/marketplace/listingCategory/select"}},
                    },
                ],
            },
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "description", write: "description"},
                        field: {name: "description", widget: "#Textarea", label: "form.descriptionLabel", placeholder: "form.descriptionPlaceholder", widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"}},
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.budget"},
        permissions: {readAny: ["currency", "budgetMax"], writeAny: ["currency", "budgetMax"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "currency", write: "currency"},
                        field: {name: "currency", widget: "#ApiSelect", label: "form.currencyLabel", placeholder: "form.currencyPlaceholder", description: "form.currencyDescription", required: true, widgetProps: {apiUrl: "/api/finance/currency/select"}},
                    },
                    {
                        render: "#Field",
                        permissions: {read: "budgetMax", write: "budgetMax"},
                        field: {name: "budgetMax", widget: "#Input", label: "form.budgetMaxLabel", placeholder: "form.budgetMaxPlaceholder", description: "form.budgetMaxDescription", required: false, widgetProps: {type: "number", min: 1, step: "any"}},
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.address"},
        permissions: {readAny: ["address"], writeAny: ["address"]},
        children: [
            {
                render: "div",
                props: {className: "grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch"},
                children: [
                    {
                        render: "div",
                        props: {className: "lg:col-span-2 space-y-6 min-w-0"},
                        children: [
                            {
                                render: "#FormGrid",
                                props: {columns: 3, className: "gap-6"},
                                children: [
                                    {
                                        render: "#Field",
                                        permissions: {read: "address", write: "address"},
                                        field: {
                                            name: "address.country",
                                            widget: "#ApiSelect",
                                            label: "form.countryLabel",
                                            placeholder: "form.countryPlaceholder",
                                            required: true,
                                            widgetProps: {
                                                apiUrl: "/api/auxiliary/country/select",
                                                method: "POST",
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
                                            label: "form.stateLabel",
                                            placeholder: "form.statePlaceholder",
                                            widgetProps: {
                                                apiUrl: "/api/auxiliary/state/select",
                                                method: "POST",
                                                pageSize: 50,
                                                postBodyFromFormFields: [{field: "address.country", paramName: "country"}],
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
                                            label: "form.cityLabel",
                                            placeholder: "form.cityPlaceholder",
                                            required: true,
                                            widgetProps: {
                                                apiUrl: "/api/auxiliary/city/select",
                                                method: "POST",
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
                            {
                                render: "#FormGrid",
                                props: {columns: 2, className: "gap-6"},
                                children: [
                                    {
                                        render: "#Field",
                                        permissions: {read: "address", write: "address"},
                                        field: {name: "address.street", widget: "#Input", label: "form.streetLabel", placeholder: "form.streetPlaceholder", required: true},
                                    },
                                    {
                                        render: "#Field",
                                        permissions: {read: "address", write: "address"},
                                        field: {name: "address.postalCode", widget: "#Input", label: "form.postalCodeLabel", placeholder: "form.postalCodePlaceholder", required: true},
                                    },
                                ],
                            },
                            {render: "#FormAlert", props: {message: "form.addressPrivacyAlert"}},
                        ],
                    },
                    {
                        render: "div",
                        props: {className: "flex flex-col lg:col-span-1 w-full min-h-[220px] h-[220px] lg:h-full lg:min-h-[220px]"},
                        children: [
                        {
                            render: "#Field",
                            permissions: {read: "address", write: "address"},
                            field: {
                                    name: "_addressMap",
                                    widget: "#FormMapPinPicker",
                                    skipWriteAccessGate: true,
                                    widgetProps: {fieldPrefix: "address", latField: "latitude", lngField: "longitude"},
                                },
                        },
                        ],
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
                        field: {name: "mainImage", widget: "#MediaField", label: "form.mainImageLabel", required: true, widgetProps: {mediaType: "image", mode: "single"}},
                    },
                    {
                        render: "#Field",
                        permissions: {read: "imageGallery", write: "imageGallery"},
                        field: {name: "imageGallery", widget: "#MediaField", label: "form.imageGalleryLabel", widgetProps: {mediaType: "image", mode: "multiple", maxCount: 8}},
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.video", defaultOpen: false},
        permissions: {readAny: ["videoGallery"], writeAny: ["videoGallery"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "videoGallery", write: "videoGallery"},
                        field: {name: "videoGallery", widget: "#MediaField", label: "form.videoGalleryLabel", widgetProps: {mediaType: "video", mode: "multiple", maxCount: 3}},
                    },
                ],
            },
        ],
    },
];

export const taskRequestCreateFormView: ViewConfig = {
    model: "taskrequests",
    viewType: "form",
    viewMode: "create",
    accessModel: "taskRequests",
    apiUrl: "/api/marketplace/taskRequest",
    method: "PUT",
    nodes: taskRequestCreateFormNodes,
};

export const taskRequestEditFormView: ViewConfig = {
    model: "taskrequests",
    viewType: "form",
    viewMode: "edit",
    accessModel: "taskRequests",
    apiUrl: "/api/marketplace/taskRequest",
    method: "PATCH",
    nodes: taskRequestEditFormNodes,
};

export const taskRequestViews: ViewConfig[] = [taskRequestSheetView, taskRequestCreateFormView, taskRequestEditFormView];
