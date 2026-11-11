import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const reviewSheetView: ViewConfig = {
    model: "reviews",
    viewType: "sheet",
    accessModel: "reviews",
    apiUrl: "/api/marketplace/review",
    header: {
        titleField: "listing.title",
        subtitleKey: "reviewSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            // The rating is in the header with what was reviewed (UX-01); the cards link the order and listing.
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "order",
                            permissions: {read: "order"},
                            field: {
                                name: "order",
                                widget: "#DisplayCard",
                                label: "order",
                                widgetProps: {
                                    icon: "#Package",
                                    valuePath: ["order.listing.title", "order.taskRequest.title", "order.name"],
                                    pickFirstTruthyValuePath: true,
                                    linkedRefPath: "order",
                                    linkedSheetModel: "orders",
                                    linkedSheetWidget: "#OrderSheetView",
                                    linkedSheetEntityProp: "order",
                                    linkedSheetValueField: "listing.title",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "reviewer",
                            permissions: {read: "reviewer"},
                            field: {
                                name: "reviewer",
                                widget: "#DisplayCard",
                                label: "reviewer",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["reviewer.name", "reviewer.surname"],
                                    joinSeparator: " ",
                                    type: "user",
                                },
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
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "comment"},
            dependent: "comment",
            permissions: {read: "comment"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "comment"},
                            field: {
                                name: "comment",
                                widget: "#ExpandableText",
                                label: "comment",
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

const ratingOptions = [
    {value: "5", label: "form.ratingValues.5"},
    {value: "4", label: "form.ratingValues.4"},
    {value: "3", label: "form.ratingValues.3"},
    {value: "2", label: "form.ratingValues.2"},
    {value: "1", label: "form.ratingValues.1"},
];

/** Reviews are never edited: the reviewer owns the words, so there is no edit form. */
const reviewCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.reviewSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "order",
                            widget: "#ApiSelect",
                            label: "form.orderLabel",
                            placeholder: "form.orderPlaceholder",
                            required: true,
                            widgetProps: {
                                apiUrl: "/api/marketplace/order/select",
                                postBody: {status: "completed", forReview: true},
                            },
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "rating",
                            widget: "#SimpleSelect",
                            label: "form.ratingLabel",
                            placeholder: "form.ratingPlaceholder",
                            required: true,
                            widgetProps: {options: ratingOptions, className: "grow w-full"},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                field: {
                    name: "comment",
                    widget: "#Textarea",
                    label: "form.commentLabel",
                    placeholder: "form.commentPlaceholder",
                    widgetProps: {className: "min-h-[120px]"},
                },
            },
        ],
    },
];

export const reviewCreateFormView: ViewConfig = {
    model: "reviews",
    viewType: "form",
    viewMode: "create",
    accessModel: "reviews",
    apiUrl: "/api/marketplace/review",
    method: "PUT",
    nodes: reviewCreateFormNodes,
};

export const reviewViews: ViewConfig[] = [reviewSheetView, reviewCreateFormView];
