import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const listingPackageSheetView: ViewConfig = {
    model: "listingpackages",
    viewType: "sheet",
    accessModel: "listingpackages",
    apiUrl: "/api/marketplace/listingPackage",
    header: {
        titleField: "name",
        subtitleKey: "listingPackageSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            // The name is the sheet title and the sort order is technical (UX-03).
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "price"},
                            field: {
                                name: "price.amount",
                                widget: "#DisplayCard",
                                label: "priceAmount",
                                widgetProps: {
                                    icon: "#DollarSign",
                                    format: "locale",
                                    valuePath: ["price.currency.symbol", "price.amount"],
                                    joinSeparator: " ",
                                    type: "currency",
                                    linkedRefPath: "price.currency",
                                    linkedSheetModel: "currencies",
                                    linkedSheetWidget: "#CurrencySheetView",
                                    linkedSheetEntityProp: "currency",
                                },
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
                            dependent: "listing",
                            permissions: {read: "listing"},
                            field: {
                                name: "listing",
                                widget: "#DisplayCard",
                                label: "listing",
                                widgetProps: {
                                    icon: "#LayoutList",
                                    valuePath: ["listing.title"],
                                    linkedRefPath: "listing",
                                    linkedSheetModel: "listings",
                                    linkedSheetWidget: "#ListingSheetView",
                                    linkedSheetEntityProp: "listing",
                                    linkedSheetValueField: "title",
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
        lifecycleSheetGroup,
    ],
};

/** The parent listing is picked on create and shown read-only on edit: a package never moves between listings. */
const listingPackageCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.basicsSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "listing",
                            widget: "#ApiSelect",
                            label: "form.listingIdLabel",
                            placeholder: "form.listingIdPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/marketplace/listing/select"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "name",
                            widget: "#Input",
                            label: "form.nameLabel",
                            placeholder: "form.namePlaceholder",
                            required: true,
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
                    widgetProps: {className: "min-h-[80px] max-h-[200px] resize-none overflow-y-auto"},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.pricingSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "price.currency",
                            widget: "#ApiSelect",
                            label: "form.currencyLabel",
                            placeholder: "form.currencyPlaceholder",
                            widgetProps: {apiUrl: "/api/finance/currency/select"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "price.amount",
                            widget: "#Input",
                            label: "form.priceAmountLabel",
                            placeholder: "form.priceAmountPlaceholder",
                            required: true,
                            widgetProps: {type: "number", min: 0, step: "any"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "deliveryDays",
                            widget: "#Input",
                            label: "form.deliveryDaysLabel",
                            placeholder: "form.deliveryDaysPlaceholder",
                            required: true,
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.visibilitySectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "order",
                            widget: "#Input",
                            label: "form.sortOrderLabel",
                            placeholder: "form.sortOrderPlaceholder",
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
];

const listingPackageEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.basicsSectionTitle"},
        permissions: {readAny: ["listing", "name", "description"], writeAny: ["name", "description"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "listing"},
                        field: {
                            name: "listing",
                            widget: "#ApiSelect",
                            label: "form.listingIdLabel",
                            disabled: true,
                            skipWriteAccessGate: true,
                            widgetProps: {apiUrl: "/api/marketplace/listing/select"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "name", write: "name"},
                        field: {
                            name: "name",
                            widget: "#Input",
                            label: "form.nameLabel",
                            placeholder: "form.namePlaceholder",
                            required: true,
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
                    widgetProps: {className: "min-h-[80px] max-h-[200px] resize-none overflow-y-auto"},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.pricingSectionTitle"},
        permissions: {readAny: ["price", "deliveryDays"], writeAny: ["price", "deliveryDays"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 3},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "price", write: "price"},
                        field: {
                            name: "price.currency",
                            widget: "#ApiSelect",
                            label: "form.currencyLabel",
                            placeholder: "form.currencyPlaceholder",
                            widgetProps: {apiUrl: "/api/finance/currency/select"},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "price", write: "price"},
                        field: {
                            name: "price.amount",
                            widget: "#Input",
                            label: "form.priceAmountLabel",
                            placeholder: "form.priceAmountPlaceholder",
                            required: true,
                            widgetProps: {type: "number", min: 0, step: "any"},
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
                            required: true,
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.visibilitySectionTitle"},
        permissions: {readAny: ["order"], writeAny: ["order"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "order", write: "order"},
                        field: {
                            name: "order",
                            widget: "#Input",
                            label: "form.sortOrderLabel",
                            placeholder: "form.sortOrderPlaceholder",
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
];

export const listingPackageCreateFormView: ViewConfig = {
    model: "listingpackages",
    viewType: "form",
    viewMode: "create",
    accessModel: "listingpackages",
    apiUrl: "/api/marketplace/listingPackage",
    method: "PUT",
    nodes: listingPackageCreateFormNodes,
};

export const listingPackageEditFormView: ViewConfig = {
    model: "listingpackages",
    viewType: "form",
    viewMode: "edit",
    accessModel: "listingpackages",
    apiUrl: "/api/marketplace/listingPackage",
    method: "PATCH",
    nodes: listingPackageEditFormNodes,
};

export const listingPackageViews: ViewConfig[] = [
    listingPackageSheetView,
    listingPackageCreateFormView,
    listingPackageEditFormView,
];
