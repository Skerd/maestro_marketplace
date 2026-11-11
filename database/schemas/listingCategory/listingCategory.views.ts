import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const listingCategorySheetView: ViewConfig = {
    model: "listingcategories",
    viewType: "sheet",
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
            dependent: "parentListingCategory",
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
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

/** The slug is generated from the name on create (unique per company) and is never typed (UX-05). */
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
        permissions: {readAny: ["name", "parentListingCategory"], writeAny: ["name", "parentListingCategory"]},
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
