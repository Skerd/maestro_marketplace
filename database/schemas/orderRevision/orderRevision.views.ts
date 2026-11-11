import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const orderRevisionSheetView: ViewConfig = {
    model: "orderrevisions",
    viewType: "sheet",
    accessModel: "orderrevisions",
    apiUrl: "/api/marketplace/orderRevision",
    header: {
        titleField: "status",
        subtitleKey: "orderRevisionSubtitle",
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
                                // The order by what was bought, not its status or number (UX-03).
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
                            permissions: {read: "requestedBy"},
                            field: {
                                name: "requestedBy",
                                widget: "#DisplayCard",
                                label: "requestedBy",
                                widgetProps: {icon: "#User", valuePath: ["requestedBy.name", "requestedBy.surname"], joinSeparator: " ", type: "user"},
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
                    render: "#ExpandableText",
                    permissions: {read: "reason"},
                    field: {
                        name: "reason",
                        widget: "#ExpandableText",
                        label: "reason",
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

export const orderRevisionViews: ViewConfig[] = [orderRevisionSheetView];
