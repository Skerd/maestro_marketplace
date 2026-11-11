import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const orderDeliverySheetView: ViewConfig = {
    model: "orderdeliveries",
    viewType: "sheet",
    accessModel: "orderdeliveries",
    apiUrl: "/api/marketplace/orderDelivery",
    header: {
        titleField: "status",
        subtitleKey: "orderDeliverySubtitle",
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
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            dependent: "message",
            props: {title: "message"},
            children: [
                {
                    render: "#ExpandableText",
                    permissions: {read: "message"},
                    field: {
                        name: "message",
                        widget: "#ExpandableText",
                        label: "message",
                    },
                },
            ],
        },
        {
            render: "#SheetGroup",
            dependent: "attachments",
            props: {title: "attachments"},
            children: [
                {
                    render: "#SheetMediaFilesStrip",
                    permissions: {read: "attachments"},
                    field: {
                        name: "attachments",
                        widget: "#SheetMediaFilesStrip",
                        widgetProps: {canDownload: true, canRemove: false, isBig: false},
                    },
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

export const orderDeliveryViews: ViewConfig[] = [orderDeliverySheetView];
