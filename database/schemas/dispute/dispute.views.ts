import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const disputeSheetView: ViewConfig = {
    model: "disputes",
    viewType: "sheet",
    accessModel: "disputes",
    apiUrl: "/api/marketplace/dispute",
    header: {
        titleField: "status",
        titleFieldLanguageCategory: "status_values",
        subtitleKey: "dispute",
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
                            permissions: {read: "order"},
                            field: {
                                name: "order",
                                widget: "#DisplayCard",
                                label: "order",
                                widgetProps: {
                                    icon: "#Package",
                                    valuePath: [
                                        "order.listing.title",
                                        "order.taskRequest.title",
                                        "order.name",
                                    ],
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
                            permissions: {read: "initiator"},
                            field: {
                                name: "initiator",
                                widget: "#DisplayCard",
                                label: "initiator",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["initiator.name", "initiator.surname"],
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
            props: {title: "reason"},
            children: [
                {
                    render: "div",
                    props: { className: "p-2 rounded-lg bg-muted/30 border border-border/50" },
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: { read: "reason" },
                            field: {
                                name: "reason",
                                widget: "#ExpandableText",
                                label: "reason",
                                widgetProps: { className: "text-sm" },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "resolution"},
            dependent: "resolution",
            children: [
                {
                    render: "div",
                    props: { className: "p-2 rounded-lg bg-muted/30 border border-border/50" },
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: { read: "resolution" },
                            field: {
                                name: "resolution",
                                widget: "#ExpandableText",
                                label: "resolution",
                                widgetProps: { className: "text-sm" },
                            },
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const disputeCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.order"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "order",
                            widget: "#ApiSelect",
                            label: "form.orderLabel",
                            placeholder: "form.orderPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/marketplace/order/select"},
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.issue"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "reason",
                            widget: "#Textarea",
                            label: "form.reasonLabel",
                            placeholder: "form.reasonPlaceholder",
                            required: true,
                            widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"},
                        },
                    },
                ],
            },
        ],
    },
];

export const disputeCreateFormView: ViewConfig = {
    model: "disputes",
    viewType: "form",
    viewMode: "create",
    accessModel: "disputes",
    apiUrl: "/api/marketplace/dispute",
    method: "PUT",
    nodes: disputeCreateFormNodes,
};

export const disputeViews: ViewConfig[] = [disputeSheetView, disputeCreateFormView];
