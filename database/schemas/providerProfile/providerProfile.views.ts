import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";
import {PROVIDER_PROFILE_TIMEZONE_MAX} from "armonia/src/modules/marketplace/api/marketplace/private/providerProfile/providerProfile.schema-def";

const weekdayOptions = [
    {value: "0", label: "weekday.0"},
    {value: "1", label: "weekday.1"},
    {value: "2", label: "weekday.2"},
    {value: "3", label: "weekday.3"},
    {value: "4", label: "weekday.4"},
    {value: "5", label: "weekday.5"},
    {value: "6", label: "weekday.6"},
];

export const providerProfileSheetView: ViewConfig = {
    model: "providerprofiles",
    viewType: "sheet",
    accessModel: "providerprofiles",
    apiUrl: "/api/marketplace/providerProfile",
    header: {
        // The full name comes from the sheet component (`headerTitle`); `name` is the readable key here.
        titleField: "user.name",
        subtitleKey: "providerProfileSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            // The person is the sheet title (UX-01); reputation is computed per request, so its gates run at render time.
            render: "#SheetGroup",
            props: {title: "overview"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "averageRating",
                            dependentRuntimeOnly: true,
                            field: {
                                name: "averageRating",
                                widget: "#DisplayCard",
                                label: "rating",
                                // Computed from reviews, not a model field — the API decides the payload.
                                skipReadAccessGate: true,
                                widgetProps: {icon: "#Star", format: "locale"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "reviewCount",
                            dependentRuntimeOnly: true,
                            field: {
                                name: "reviewCount",
                                widget: "#DisplayCard",
                                label: "ratingCount",
                                skipReadAccessGate: true,
                                widgetProps: {icon: "#MessageSquare", format: "locale"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "completionRate",
                            dependentRuntimeOnly: true,
                            field: {
                                name: "completionRate",
                                widget: "#DisplayCard",
                                label: "completionRate",
                                skipReadAccessGate: true,
                                widgetProps: {icon: "#CheckCircle", format: "locale", suffix: "%"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "timezone",
                            permissions: {read: "timezone"},
                            field: {
                                name: "timezone",
                                widget: "#DisplayCard",
                                label: "timezone",
                                widgetProps: {icon: "#Globe"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            // One compact week (UX-08), Monday first; days without windows read "Not available".
            render: "#SheetGroup",
            props: {title: "availability"},
            dependent: "availability",
            permissions: {read: "availability"},
            children: [
                {
                    render: "#WeeklyHours",
                    permissions: {read: "availability"},
                    field: {name: "availability", widget: "#WeeklyHours", widgetProps: {closedKey: "notAvailable"}},
                },
            ],
        },
        // The provider's records (providerProfileHub), after when they work and before the profile text (UX-03).
        {
            // Cards or one line each, the reader's choice (remembered per list).
            render: "#ReferencesViewModeScope",
            props: {storageKey: "marketplace.providerProfile.sheet.listings.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (providerProfileHub).
                    render: "#SheetGroup",
                    dependent: "listings",
                    dependentRuntimeOnly: true,
                    props: {title: "listingsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "listings",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#ListingCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // What the provider offers, at what price, and whether it is live.
                                                icon: "#IconBriefcase",
                                                label: "listingRow",
                                                labelPath: "title",
                                                valuePath: ["price", "status"],
                                                valueLanguageKeyCategories: [null, "listingStatus"],
                                                valueFormats: [{money: "priceCurrency"}, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "listings",
                                                linkedSheetWidget: "#ListingSheetView",
                                                linkedSheetEntityProp: "listing",
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
            props: {storageKey: "marketplace.providerProfile.sheet.orders.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (providerProfileHub).
                    render: "#SheetGroup",
                    dependent: "orders",
                    dependentRuntimeOnly: true,
                    props: {title: "ordersGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "orders",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#OrderCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Who ordered, when, for how much and how it stands; the order number stays on the opened sheet.
                                                icon: "#IconReceipt",
                                                label: "orderRow",
                                                labelPath: ["customer.name", "customer.surname"],
                                                labelJoinSeparator: " ",
                                                valuePath: ["createdAt", "amount", "status"],
                                                valueLanguageKeyCategories: [null, null, "orderStatus"],
                                                valueFormats: ["date", {money: "currency"}, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "orders",
                                                linkedSheetWidget: "#OrderSheetView",
                                                linkedSheetEntityProp: "order",
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
            props: {storageKey: "marketplace.providerProfile.sheet.bids.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (providerProfileHub).
                    render: "#SheetGroup",
                    dependent: "bids",
                    dependentRuntimeOnly: true,
                    props: {title: "bidsGroup", titleActions: "#ReferencesViewModeToggle", defaultOpen: false},
                    children: [
                        {
                            render: "div",
                            props: {className: "rounded-lg bg-muted/30 border border-border/50"},
                            children: [
                                {
                                    render: "#ReferencesRender",
                                    field: {
                                        name: "bids",
                                        widget: "#ReferencesRender",
                                        widgetProps: {
                                            cardWidget: "#BidCard",
                                            pageSize: 4,
                                            columns: 2,
                                            compactRow: {
                                                // Which task request, when, the offered amount and how it stands.
                                                icon: "#IconCoin",
                                                label: "bidRow",
                                                labelPath: "taskRequest.title",
                                                valuePath: ["createdAt", "amount", "status"],
                                                valueLanguageKeyCategories: [null, null, "bidStatus"],
                                                valueFormats: ["date", {money: "currency"}, null],
                                                joinSeparator: " · ",
                                                linkedSheetModel: "marketplacebids",
                                                linkedSheetWidget: "#BidSheetView",
                                                linkedSheetEntityProp: "bid",
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
            props: {storageKey: "marketplace.providerProfile.sheet.reviews.listDisplay", defaultMode: "compact"},
            children: [
                {
                    // Read with the caller's own grants on that model; absent when they may not read it (providerProfileHub).
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
            props: {title: "bio"},
            dependent: "bio",
            permissions: {read: "bio"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "bio"},
                            field: {
                                name: "bio",
                                widget: "#ExpandableText",
                                label: "bio",
                                widgetProps: {className: "text-sm"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "skills"},
            dependent: "skills",
            permissions: {read: "skills"},
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 1},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "skills"},
                            field: {
                                name: "skills",
                                widget: "#DisplayCard",
                                label: "skills",
                                widgetProps: {icon: "#Tag", valueType: "stringBadgeList"},
                            },
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "portfolio"},
            dependent: "portfolio",
            permissions: {read: "portfolio"},
            children: [
                {
                    render: "div",
                    props: {className: "p-4 rounded-lg bg-muted/30 border border-border/50 max-w-full"},
                    children: [
                        {
                            render: "#SheetMediaFilesStrip",
                            permissions: {read: "portfolio"},
                            field: {
                                name: "portfolio",
                                widget: "#SheetMediaFilesStrip",
                                label: "portfolio",
                            },
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

const availabilityRepeaterProps = {
    // The group above owns the title, so the repeater adds rows without a heading of its own.
    arrayField: "availability",
    defaultItem: {dayOfWeek: "1", startTime: "09:00", endTime: "17:00"},
    addLabel: "form.availabilityAddRow",
    removeLabel: "form.availabilityRemoveRow",
    rowTitleFields: ["dayOfWeek", "startTime", "endTime"],
    rowTitleSeparators: [" ", " - "],
    rowTitlePlaceholder: "form.availabilityRowTitle",
    rowTemplate: [
        {
            render: "#FormGrid",
            props: {columns: 3},
            children: [
                {
                    render: "#Field",
                    field: {
                        name: "dayOfWeek",
                        widget: "#SimpleSelect",
                        label: "form.dayOfWeekLabel",
                        required: true,
                        widgetProps: {options: weekdayOptions},
                    },
                },
                {
                    render: "#Field",
                    field: {
                        name: "startTime",
                        widget: "#DateInput",
                        label: "form.startTimeLabel",
                        placeholder: "form.startTimePlaceholder",
                        required: true,
                        widgetProps: {valueFormat: "HH:mm", timeOnly: true},
                    },
                },
                {
                    render: "#Field",
                    field: {
                        name: "endTime",
                        widget: "#DateInput",
                        label: "form.endTimeLabel",
                        placeholder: "form.endTimePlaceholder",
                        required: true,
                        // 24:00 ends a window at midnight (WeeklyHoursSlotDef).
                        widgetProps: {valueFormat: "HH:mm", timeOnly: true, allowEndOfDay: true},
                    },
                },
            ],
        },
    ],
};

const providerProfileCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.profile"},
        children: [
            {
                // Company list picks the provider; the account page locks it to that user.
                render: "#Field",
                props: {skipRenderWhenFormExtraTruthy: "lockUser"},
                field: {
                    name: "userId",
                    widget: "#ApiSelect",
                    label: "form.userLabel",
                    placeholder: "form.userPlaceholder",
                    required: true,
                    widgetProps: {
                        apiUrl: "/api/company/users/select",
                        normalizeEmptyToUndefined: true,
                    },
                },
            },
            {
                render: "#Field",
                field: {
                    name: "bio",
                    widget: "#Textarea",
                    label: "form.bioLabel",
                    placeholder: "form.bioPlaceholder",
                    widgetProps: {className: "min-h-[140px]"},
                },
            },
            {
                render: "#Field",
                field: {
                    name: "skills",
                    widget: "#StringArrayInput",
                    label: "form.skillsLabel",
                    placeholder: "form.skillsPlaceholder",
                    widgetProps: {removeTooltipKey: "form.skillsRemoveTooltip"},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.availability"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        // The windows below are in this zone; it starts as the company's (UX-06, D105).
                        render: "#Field",
                        field: {
                            name: "timezone",
                            widget: "#Input",
                            label: "form.timezoneLabel",
                            placeholder: "form.timezonePlaceholder",
                            widgetProps: {maxLength: PROVIDER_PROFILE_TIMEZONE_MAX},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                field: {name: "availability", widget: "#FormRepeater", widgetProps: availabilityRepeaterProps},
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.portfolio"},
        children: [
            {
                render: "#Field",
                field: {
                    name: "portfolio",
                    widget: "#MediaField",
                    label: "form.portfolioLabel",
                    widgetProps: {mediaType: "file", mode: "multiple", maxCount: 20},
                },
            },
        ],
    },
];

/** The account page edits one field at a time and finds each `#Field` by name inside these groups. */
const providerProfileEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.profile"},
        permissions: {readAny: ["bio", "skills"], writeAny: ["bio", "skills"]},
        children: [
            {
                render: "#Field",
                permissions: {read: "bio", write: "bio"},
                field: {
                    name: "bio",
                    widget: "#Textarea",
                    label: "form.bioLabel",
                    placeholder: "form.bioPlaceholder",
                    widgetProps: {className: "min-h-[140px]"},
                },
            },
            {
                render: "#Field",
                permissions: {read: "skills", write: "skills"},
                field: {
                    name: "skills",
                    widget: "#StringArrayInput",
                    label: "form.skillsLabel",
                    placeholder: "form.skillsPlaceholder",
                    widgetProps: {removeTooltipKey: "form.skillsRemoveTooltip"},
                },
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.availability"},
        permissions: {readAny: ["timezone", "availability"], writeAny: ["timezone", "availability"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "timezone", write: "timezone"},
                        field: {
                            name: "timezone",
                            widget: "#Input",
                            label: "form.timezoneLabel",
                            placeholder: "form.timezonePlaceholder",
                            widgetProps: {maxLength: PROVIDER_PROFILE_TIMEZONE_MAX},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                permissions: {read: "availability", write: "availability"},
                field: {name: "availability", widget: "#FormRepeater", widgetProps: availabilityRepeaterProps},
            },
        ],
    },
    {
        render: "#TitleWithCollapse",
        props: {title: "form.section.portfolio"},
        permissions: {readAny: ["portfolio"], writeAny: ["portfolio"]},
        children: [
            {
                render: "#Field",
                permissions: {read: "portfolio", write: "portfolio"},
                field: {
                    name: "portfolio",
                    widget: "#MediaField",
                    label: "form.portfolioLabel",
                    widgetProps: {mediaType: "file", mode: "multiple", maxCount: 20},
                },
            },
        ],
    },
];

export const providerProfileCreateFormView: ViewConfig = {
    model: "providerprofiles",
    viewType: "form",
    viewMode: "create",
    accessModel: "providerprofiles",
    apiUrl: "/api/marketplace/providerProfile",
    method: "PUT",
    nodes: providerProfileCreateFormNodes,
};

export const providerProfileEditFormView: ViewConfig = {
    model: "providerprofiles",
    viewType: "form",
    viewMode: "edit",
    accessModel: "providerprofiles",
    apiUrl: "/api/marketplace/providerProfile",
    method: "PATCH",
    nodes: providerProfileEditFormNodes,
};

export const providerProfileViews: ViewConfig[] = [
    providerProfileSheetView,
    providerProfileCreateFormView,
    providerProfileEditFormView,
];
