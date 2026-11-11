import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const promotionSheetView: ViewConfig = {
    model: "promotions",
    viewType: "sheet",
    accessModel: "promotions",
    apiUrl: "/api/marketplace/promotion",
    header: {
        titleField: "name",
        subtitleKey: "promotion",
        showCloseButton: true,
    },
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "listing"},
                            field: {
                                name: "listing",
                                widget: "#DisplayCard",
                                label: "listing",
                                widgetProps: {
                                    icon: "#LayoutList",
                                    parent: "listing",
                                    valuePath: ["title", "status"],
                                    joinSeparator: " · ",
                                    languageKeyCategoriesByPath: {status: "listingStatus"},
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
                            permissions: {read: "type"},
                            field: {
                                name: "type",
                                widget: "#DisplayCard",
                                label: "type",
                                widgetProps: {
                                    icon: "#Tag",
                                    languageKeyCategory: "type_values", type: "enum",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "startAt"},
                            field: {
                                name: "startAt",
                                widget: "#DisplayCard",
                                label: "startAt",
                                widgetProps: {icon: "#Calendar", type: "dateTime"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "endAt"},
                            field: {
                                name: "endAt",
                                widget: "#DisplayCard",
                                label: "endAt",
                                widgetProps: {icon: "#Calendar", type: "dateTime"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "stopReasonSection"},
            dependent: "stopReason",
            permissions: {read: "stopReason"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "stopReason"},
                            field: {
                                name: "stopReason",
                                widget: "#ExpandableText",
                                label: "stopReason",
                                widgetProps: {className: "text-sm", maxLength: 400},
                            },
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const promotionCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.promotionSectionTitle", defaultOpen: true},
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
                            label: "form.listingLabel",
                            placeholder: "form.listingPlaceholder",
                            required: true,
                            widgetProps: {
                                apiUrl: "/api/marketplace/listing/select",
                                postBody: {activeOnly: true},
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "type",
                            widget: "#SimpleSelect",
                            label: "form.promotionTypeLabel",
                            placeholder: "form.promotionTypePlaceholder",
                            required: true,
                            widgetProps: {
                                options: [
                                    {value: "featured", label: "form.promotionTypeFeatured"},
                                    {value: "sponsored", label: "form.promotionTypeSponsored"},
                                ],
                                className: "grow w-full",
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.scheduleSectionTitle", defaultOpen: true},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "startAt",
                            widget: "#DateInput",
                            label: "form.startAtLabel",
                            placeholder: "form.startAtPlaceholder",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "endAt",
                            widget: "#DateInput",
                            label: "form.endAtLabel",
                            placeholder: "form.endAtPlaceholder",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm", minDateField: "startAt"},
                        },
                    },
                ],
            },
        ],
    },
];

export const promotionCreateFormView: ViewConfig = {
    model: "promotions",
    viewType: "form",
    viewMode: "create",
    accessModel: "promotions",
    apiUrl: "/api/marketplace/promotion",
    method: "PUT",
    nodes: promotionCreateFormNodes
};

export const promotionViews: ViewConfig[] = [promotionSheetView, promotionCreateFormView];
