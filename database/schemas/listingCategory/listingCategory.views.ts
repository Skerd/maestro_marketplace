import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {LISTING_CATEGORY_NAME_MAX} from "armonia/src/modules/marketplace/api/marketplace/private/listingCategory/listingCategory.schema-def";

export const listingCategorySheetView: ViewConfig = {
    model: "listingcategories",
    viewType: "sheet",
    sheetWidget: "#ListingCategorySheetView",
    accessModel: "listingcategories",
    apiUrl: "/api/marketplace/listingCategory",
    header: {
        titleField: "name",
        subtitleKey: "listingCategorySubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            // Name is the title and slug/order are technical (UX-03): only the parent is left to show.
            render: "#SheetGroup",
            props: {title: "overview"},
            dependentAny: ["delivery", "parentListingCategory"],
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "delivery",
                            permissions: {read: "delivery"},
                            field: {
                                name: "delivery",
                                widget: "#DisplayCard",
                                label: "delivery",
                                widgetProps: {icon: "#MapPin", languageKeyCategory: "listingCategoryDelivery", type: "enum"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "parentListingCategory",
                            permissions: {read: "parentListingCategory"},
                            field: {
                                name: "parentListingCategory.name",
                                widget: "#DisplayCard",
                                label: "parentListingCategory",
                                widgetProps: {
                                    icon: "#IconCategory2",
                                    linkedRefPath: "parentListingCategory",
                                    linkedSheetModel: "listingcategories",
                                    linkedSheetWidget: "#ListingCategorySheetView",
                                    linkedSheetEntityProp: "parentListingCategory",
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

/** On-site work is matched by distance to the client, remote work anywhere (D143). */
const deliveryOptions = [
    {value: "onsite", label: "form.delivery.onsite"},
    {value: "remote", label: "form.delivery.remote"},
];

const deliveryField = {
    name: "delivery",
    widget: "#SimpleSelect",
    label: "form.deliveryLabel",
    placeholder: "form.deliveryPlaceholder",
    required: true,
    widgetProps: {options: deliveryOptions, className: "grow w-full"},
};

/** The slug is generated from the name on create (unique in the tree) and is never typed (UX-05). */
const categoryCreateFormNodes: ViewConfig["nodes"] = [
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
                            name: "name",
                            widget: "#Input",
                            label: "form.nameLabel",
                            placeholder: "form.namePlaceholder",
                            required: true,
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "parentListingCategory",
                            widget: "#ApiSelect",
                            label: "form.parentListingCategoryLabel",
                            placeholder: "form.parentListingCategoryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/marketplace/listingCategory/select",
                                normalizeEmptyToUndefined: true,
                            },
                        },
                    },
                    {render: "#Field", field: deliveryField},
                ],
            },
        ],
    },
    {
        // The name in each panel language (D196): companies and clients read the one of their language, else English.
        render: "#TitleWithCollapse",
        props: {title: "form.namesSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "names.en",
                            widget: "#Input",
                            label: "form.nameEnLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "names.sq",
                            widget: "#Input",
                            label: "form.nameSqLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "names.de",
                            widget: "#Input",
                            label: "form.nameDeLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "names.fr",
                            widget: "#Input",
                            label: "form.nameFrLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "names.it",
                            widget: "#Input",
                            label: "form.nameItLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
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
                            label: "form.orderLabel",
                            placeholder: "form.orderPlaceholder",
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
];

const categoryEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.basicsSectionTitle"},
        permissions: {readAny: ["name", "parentListingCategory", "delivery"], writeAny: ["name", "parentListingCategory", "delivery"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
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
                    {
                        render: "#Field",
                        permissions: {read: "parentListingCategory", write: "parentListingCategory"},
                        field: {
                            name: "parentListingCategory",
                            widget: "#ApiSelect",
                            label: "form.parentListingCategoryLabel",
                            placeholder: "form.parentListingCategoryPlaceholder",
                            widgetProps: {
                                apiUrl: "/api/marketplace/listingCategory/select",
                                normalizeEmptyToUndefined: true,
                                postBodyFormExtrasMerge: {excludeCategoryId: "categoryId"},
                                remountKeyFormField: "_id",
                            },
                        },
                    },
                    {render: "#Field", permissions: {read: "delivery", write: "delivery"}, field: deliveryField},
                ],
            },
        ],
    },
    {
        // The name in each panel language (D196): companies and clients read the one of their language, else English.
        render: "#TitleWithCollapse",
        props: {title: "form.namesSectionTitle"},
        permissions: {readAny: ["names"], writeAny: ["names"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "names", write: "names"},
                        field: {
                            name: "names.en",
                            widget: "#Input",
                            label: "form.nameEnLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "names", write: "names"},
                        field: {
                            name: "names.sq",
                            widget: "#Input",
                            label: "form.nameSqLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "names", write: "names"},
                        field: {
                            name: "names.de",
                            widget: "#Input",
                            label: "form.nameDeLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "names", write: "names"},
                        field: {
                            name: "names.fr",
                            widget: "#Input",
                            label: "form.nameFrLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
                        },
                    },
                    {
                        render: "#Field",
                        permissions: {read: "names", write: "names"},
                        field: {
                            name: "names.it",
                            widget: "#Input",
                            label: "form.nameItLabel",
                            widgetProps: {maxLength: LISTING_CATEGORY_NAME_MAX},
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
                            label: "form.orderLabel",
                            placeholder: "form.orderPlaceholder",
                            widgetProps: {type: "number", min: 0, step: 1},
                        },
                    },
                ],
            },
        ],
    },
];

export const listingCategoryCreateFormView: ViewConfig = {
    model: "listingcategories",
    viewType: "form",
    viewMode: "create",
    accessModel: "listingcategories",
    apiUrl: "/api/marketplace/listingCategory",
    method: "PUT",
    nodes: categoryCreateFormNodes,
};

export const listingCategoryEditFormView: ViewConfig = {
    model: "listingcategories",
    viewType: "form",
    viewMode: "edit",
    accessModel: "listingcategories",
    apiUrl: "/api/marketplace/listingCategory",
    method: "PATCH",
    nodes: categoryEditFormNodes,
};

export const listingCategoryViews: ViewConfig[] = [listingCategorySheetView, listingCategoryCreateFormView, listingCategoryEditFormView];
