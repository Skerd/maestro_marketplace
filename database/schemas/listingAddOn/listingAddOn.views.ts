import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const listingAddOnSheetView: ViewConfig = {
    model: "listingaddons",
    viewType: "sheet",
    accessModel: "listingaddons",
    apiUrl: "/api/marketplace/listingAddOn",
    header: {
        titleField: "name",
        subtitleKey: "listingAddOnSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            // The name is the sheet title (UX-03).
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
        lifecycleSheetGroup,
    ],
};

/** The parent listing is picked on create and shown read-only on edit: an add-on never moves between listings. */
const listingAddOnCreateFormNodes: ViewConfig["nodes"] = [
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
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
];

const listingAddOnEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.basicsSectionTitle"},
        permissions: {readAny: ["listing", "name"], writeAny: ["name"]},
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
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
];

export const listingAddOnCreateFormView: ViewConfig = {
    model: "listingaddons",
    viewType: "form",
    viewMode: "create",
    accessModel: "listingaddons",
    apiUrl: "/api/marketplace/listingAddOn",
    method: "PUT",
    nodes: listingAddOnCreateFormNodes,
};

export const listingAddOnEditFormView: ViewConfig = {
    model: "listingaddons",
    viewType: "form",
    viewMode: "edit",
    accessModel: "listingaddons",
    apiUrl: "/api/marketplace/listingAddOn",
    method: "PATCH",
    nodes: listingAddOnEditFormNodes,
};

export const listingAddOnViews: ViewConfig[] = [
    listingAddOnSheetView,
    listingAddOnCreateFormView,
    listingAddOnEditFormView,
];
