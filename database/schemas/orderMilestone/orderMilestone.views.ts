import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const orderMilestoneSheetView: ViewConfig = {
    model: "ordermilestones",
    viewType: "sheet",
    accessModel: "ordermilestones",
    apiUrl: "/api/marketplace/orderMilestone",
    header: {
        titleField: "name",
        subtitleKey: "orderMilestoneSubtitle",
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
                            permissions: {read: "amount"},
                            field: {
                                name: "amount",
                                widget: "#DisplayCard",
                                label: "amount",
                                widgetProps: {icon: "#DollarSign", format: "locale", valuePath: ["currency.symbol", "amount"], joinSeparator: " ", type: "currency"},
                            },
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

export const orderMilestoneViews: ViewConfig[] = [orderMilestoneSheetView];
