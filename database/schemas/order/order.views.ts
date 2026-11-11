import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const orderSheetView: ViewConfig = {
    model: "orders",
    viewType: "sheet",
    accessModel: "orders",
    apiUrl: "/api/marketplace/order",
    header: {
        titleField: "name",
        subtitleKey: "order",
        showCloseButton: true,
    },
    // UX-03: status and next step sit in the header and the action menu; then amount and milestones, the work
    // delivered, its disputes, sessions and reviews, what the order came from, and Lifecycle last.
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
                                },
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "deliveryDueDate",
                            permissions: {read: "deliveryDueDate"},
                            field: {
                                name: "deliveryDueDate",
                                widget: "#DisplayCard",
                                label: "deliveryDueDate",
                                widgetProps: {icon: "#Calendar", format: "date", type: "date"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "customer"},
                            field: {
                                name: "customer",
                                widget: "#DisplayCard",
                                label: "customer",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["customer.name", "customer.surname"],
                                    joinSeparator: " ",
                                    type: "user",
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
        // The related lists are loaded by the single route for the order's parties (see readOrderChildren).
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.order.sheet.milestones.listDisplay", defaultMode: "compact"},
            children: [
                {
                    render: "#SheetGroup",
                    dependent: "milestones",
                    dependentRuntimeOnly: true,
                    props: {title: "milestones", titleActions: "#ReferencesViewModeToggle"},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "milestones",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#OrderMilestoneCard",
                                            itemDataProp: "milestone",
                                            pageSize: 3,
                                            compactRow: {
                                                icon: "#IconFlag",
                                                label: "milestone",
                                                labelPath: "name",
                                                valuePath: ["amount", "status"],
                                                valueFormats: [{money: "currency"}, null],
                                                valueLanguageKeyCategories: [null, "orderMilestoneStatus"],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "ordermilestones",
                                                linkedSheetWidget: "#OrderMilestoneSheetView",
                                                linkedSheetEntityProp: "milestone",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.order.sheet.deliveries.listDisplay", defaultMode: "compact"},
            children: [
                {
                    render: "#SheetGroup",
                    dependent: "deliveries",
                    dependentRuntimeOnly: true,
                    props: {title: "deliveries", titleActions: "#ReferencesViewModeToggle"},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "deliveries",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#OrderDeliveryCard",
                                            itemDataProp: "delivery",
                                            pageSize: 3,
                                            compactRow: {
                                                icon: "#IconPackageExport",
                                                label: "delivery",
                                                labelPath: "createdAt",
                                                labelFormat: "dateTime",
                                                valuePath: ["status", "message"],
                                                valueLanguageKeyCategories: ["orderDeliveryStatus", null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "orderdeliveries",
                                                linkedSheetWidget: "#OrderDeliverySheetView",
                                                linkedSheetEntityProp: "delivery",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.order.sheet.revisions.listDisplay", defaultMode: "compact"},
            children: [
                {
                    render: "#SheetGroup",
                    dependent: "revisions",
                    dependentRuntimeOnly: true,
                    props: {title: "revisions", titleActions: "#ReferencesViewModeToggle"},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "revisions",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#OrderRevisionCard",
                                            itemDataProp: "revision",
                                            pageSize: 3,
                                            compactRow: {
                                                icon: "#IconRefresh",
                                                label: "revision",
                                                labelPath: "createdAt",
                                                labelFormat: "dateTime",
                                                valuePath: ["status", "reason"],
                                                valueLanguageKeyCategories: ["orderRevisionStatus", null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "orderrevisions",
                                                linkedSheetWidget: "#OrderRevisionSheetView",
                                                linkedSheetEntityProp: "revision",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.order.sheet.disputes.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (the single route, readOrderChildren).
                    render: "#SheetGroup",
                    dependent: "disputes",
                    dependentRuntimeOnly: true,
                    props: {title: "disputesGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "disputes",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#DisputeCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who opened it, when, how it stands and why.
                                                icon: "#IconGavel",
                                                label: "disputeRow",
                                                labelPath: ["initiator.name", "initiator.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "status", "reason"],
                                                valueLanguageKeyCategories: [null, "disputeStatus", null],
                                                valueFormats: ["date", null, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "disputes",
                                                linkedSheetWidget: "#DisputeSheetView",
                                                linkedSheetEntityProp: "dispute",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.order.sheet.bookings.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (the single route, readOrderChildren).
                    render: "#SheetGroup",
                    dependent: "bookings",
                    dependentRuntimeOnly: true,
                    props: {title: "bookingsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "bookings",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#BookingCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // When the session is, and with whom.
                                                icon: "#IconCalendarEvent",
                                                label: "bookingRow",
                                                labelPath: ["startAt", "endAt"],
                                                labelFormat: "dateTime",
                                                valuePath: ["provider.name", "provider.surname"],
                                                joinSeparator: " ",
                                                linkedSheetModel: "bookings",
                                                linkedSheetWidget: "#BookingSheetView",
                                                linkedSheetEntityProp: "booking",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.order.sheet.reviews.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (the single route, readOrderChildren).
                    render: "#SheetGroup",
                    dependent: "reviews",
                    dependentRuntimeOnly: true,
                    props: {title: "reviewsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "reviews",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#ReviewCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who reviewed, when, the stars and what they wrote.
                                                icon: "#IconStar",
                                                label: "reviewRow",
                                                labelPath: ["reviewer.name", "reviewer.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "rating", "comment"],
                                                valueFormats: ["date", null, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "reviews",
                                                linkedSheetWidget: "#ReviewSheetView",
                                                linkedSheetEntityProp: "review",
                                            },
                                        },
                                    },
                                },
                            ],
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            dependentAny: ["listing", "taskRequest", "bid"],
            props: {title: "references"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "listing",
                            permissions: {read: "listing"},
                            field: {
                                name: "listing",
                                widget: "#DisplayCard",
                                label: "listingLabel",
                                widgetProps: {
                                    icon: "#Package",
                                    valuePath: ["listing.title"],
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
                            dependent: "taskRequest",
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
                            dependent: "bid",
                            permissions: {read: "bid"},
                            field: {
                                name: "bid",
                                widget: "#DisplayCard",
                                label: "bid",
                                // The winning bid by what it offered, not its BID- code (UX-03).
                                widgetProps: {
                                    icon: "#FileText",
                                    format: "locale",
                                    valuePath: ["currency.symbol", "bid.amount"],
                                    joinSeparator: " ",
                                    type: "currency",
                                    linkedRefPath: "bid",
                                    linkedSheetModel: "marketplacebids",
                                    linkedSheetWidget: "#BidSheetView",
                                    linkedSheetEntityProp: "bid",
                                    linkedSheetValueField: "name",
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            dependent: "note",
            permissions: {read: "note"},
            props: {title: "note"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "note"},
                            field: {
                                name: "note",
                                widget: "#ExpandableText",
                                label: "note",
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

export const orderViews: ViewConfig[] = [orderSheetView];
