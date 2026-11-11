import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const bidSheetView: ViewConfig = {
    model: "marketplacebids",
    viewType: "sheet",
    accessModel: "marketplacebids",
    apiUrl: "/api/marketplace/bid",
    header: {
        titleField: "name",
        subtitleKey: "bid",
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
                            permissions: {read: "taskRequest"},
                            field: {
                                name: "taskRequest",
                                widget: "#DisplayCard",
                                label: "taskRequest",
                                widgetProps: {
                                    icon: "#Briefcase",
                                    valuePath: ["taskRequest.title"],
                                    linkedRefPath: "taskRequest",
                                    linkedSheetModel: "taskRequests",
                                    linkedSheetWidget: "#TaskRequestSheetView",
                                    linkedSheetEntityProp: "entity",
                                    linkedSheetValueField: "title",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "bidder"},
                            field: {
                                name: "bidder",
                                widget: "#DisplayCard",
                                label: "bidder",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["bidder.name", "bidder.surname"],
                                    joinSeparator: " ",
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "amount"},
                            field: {
                                name: "amount",
                                widget: "#DisplayCard",
                                label: "amount",
                                widgetProps: {
                                    icon: "#DollarSign",
                                    format: "locale",
                                    valuePath: ["currency.symbol", "amount"],
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
                            permissions: {read: "deliveryDays"},
                            field: {
                                name: "deliveryDays",
                                widget: "#DisplayCard",
                                label: "deliveryDays",
                                widgetProps: {icon: "#Calendar", valueTemplateKey: "deliveryDaysValue"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "proposal"},
            children: [
                {
                    render: "div",
                    props: {className: "p-4 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "proposal"},
                            field: {
                                name: "proposal",
                                widget: "#ExpandableText",
                                label: "proposal",
                            },
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const bidCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.taskRequest"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "taskRequest",
                            widget: "#ApiSelect",
                            label: "form.taskRequestIdLabel",
                            placeholder: "form.taskRequestIdPlaceholder",
                            required: true,
                            widgetProps: {
                                apiUrl: "/api/marketplace/taskRequest/select",
                                postBody: {activeOnly: true},
                            },
                        },
                    },
                ],
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.offer"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "amount",
                            widget: "#Input",
                            label: "form.amountLabel",
                            placeholder: "form.amountPlaceholder",
                            // The bid takes the task request's currency (UX-07).
                            description: "form.amountCurrencyDescription",
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
            {
                render: "#FormGrid",
                props: {columns: 1},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "proposal",
                            widget: "#Textarea",
                            label: "form.proposalLabel",
                            placeholder: "form.proposalPlaceholder",
                            required: true,
                            widgetProps: {className: "resize-none max-h-[250px] overflow-y-auto"},
                        },
                    },
                ],
            },
        ],
    },
];

export const bidCreateFormView: ViewConfig = {
    model: "marketplacebids",
    viewType: "form",
    viewMode: "create",
    accessModel: "marketplacebids",
    apiUrl: "/api/marketplace/bid",
    method: "PUT",
    nodes: bidCreateFormNodes,
};

export const bidViews: ViewConfig[] = [bidSheetView, bidCreateFormView];
