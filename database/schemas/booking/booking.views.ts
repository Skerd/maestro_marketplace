import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const bookingSheetView: ViewConfig = {
    model: "bookings",
    viewType: "sheet",
    accessModel: "bookings",
    apiUrl: "/api/marketplace/booking",
    header: {
        // The full name comes from the sheet component (`headerTitle`); `name` is the readable key here.
        titleField: "provider.name",
        subtitleKey: "bookingSubtitle",
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
                            permissions: {read: "startAt"},
                            field: {
                                name: "startAt",
                                widget: "#DisplayCard",
                                label: "startAt",
                                widgetProps: {icon: "#Calendar", format: "dateTime", type: "dateTime"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "endAt"},
                            field: {
                                name: "endAt",
                                widget: "#DisplayCard",
                                label: "endAt",
                                widgetProps: {icon: "#Calendar", format: "dateTime", type: "dateTime"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "order"},
                            field: {
                                name: "order",
                                widget: "#DisplayCard",
                                label: "order",
                                // The order by what was bought, not its number (UX-03).
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

// The booking's time zone is the provider's (set by the server), so the form only asks for the order and the times.
const bookingCreateFormNodes: ViewConfig["nodes"] = [
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
        props: {title: "form.section.schedule"},
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
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm", timeZoneField: "timezone", companyTimeZone: true},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "endAt",
                            widget: "#DateInput",
                            label: "form.endAtLabel",
                            required: true,
                            widgetProps: {valueFormat: "YYYY-MM-DD HH:mm", minDateField: "startAt", timeZoneField: "timezone", companyTimeZone: true},
                        },
                    },
                ],
            },
            {render: "#FormAlert", props: {message: "form.providerHoursHint"}},
        ],
    },
];

export const bookingCreateFormView: ViewConfig = {
    model: "bookings",
    viewType: "form",
    viewMode: "create",
    accessModel: "bookings",
    apiUrl: "/api/marketplace/booking",
    method: "PUT",
    nodes: bookingCreateFormNodes,
};

export const bookingViews: ViewConfig[] = [bookingSheetView, bookingCreateFormView];
