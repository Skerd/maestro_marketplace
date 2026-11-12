import {JOB_AREA_RADIUS_M} from "@marketplaceModule/utilities/services/jobLocation";
import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

/**
 * A provider's lead (D143): the job as they may see it before the award (city level, no street, postcode, pin or
 * buyer), how far it is, and the quote they placed.
 */
/** The job's facts, shown beside the area map when there is one and across the group when there is none. */
const jobCards: ViewConfig["nodes"] = [
    {
        render: "#DisplayCard",
        dependent: "taskRequest.category",
        permissions: {read: "taskRequest"},
        field: {name: "taskRequest.category.name", widget: "#DisplayCard", label: "category", widgetProps: {icon: "#Category2"}},
    },
    {
        render: "#DisplayCard",
        dependent: "taskRequest.address.city",
        permissions: {read: "taskRequest"},
        field: {name: "taskRequest.address.city.name", widget: "#DisplayCard", label: "city", widgetProps: {icon: "#Building"}},
    },
    {
        render: "#DisplayCard",
        dependent: "distanceKm",
        permissions: {read: "distanceKm"},
        field: {name: "distanceKm", widget: "#DisplayCard", label: "distance", widgetProps: {icon: "#MapPin", format: "locale", valueTemplateKey: "distanceValue"}},
    },
    {
        render: "#DisplayCard",
        dependent: "taskRequest.budgetMax",
        permissions: {read: "taskRequest"},
        field: {
            name: "taskRequest.budgetMax",
            widget: "#DisplayCard",
            label: "budgetMax",
            widgetProps: {icon: "#DollarSign", format: "locale", valuePath: ["taskRequest.currency.symbol", "taskRequest.budgetMax"], joinSeparator: " ", type: "currency"},
        },
    },
    {
        render: "#DisplayCard",
        dependent: "taskRequest.expiresAt",
        permissions: {read: "taskRequest"},
        field: {name: "taskRequest.expiresAt", widget: "#DisplayCard", label: "expiresAt", widgetProps: {icon: "#Calendar", type: "date"}},
    },
    {
        render: "#DisplayCard",
        permissions: {read: "status"},
        field: {name: "status", widget: "#DisplayCard", label: "status", widgetProps: {icon: "#Flag", languageKeyCategory: "taskLeadStatus", type: "enum"}},
    },
];

export const taskLeadSheetView: ViewConfig = {
    model: "taskleads",
    viewType: "sheet",
    accessModel: "taskleads",
    apiUrl: "/api/marketplace/taskLead",
    header: {
        titleField: "taskRequest.title",
        subtitleKey: "leadSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            render: "#SheetGroup",
            props: {title: "photos"},
            dependent: "taskRequest.mainImage",
            children: [
                {
                    render: "div",
                    props: {className: "max-w-full"},
                    children: [
                        {
                            render: "#GalleryCarousel",
                            permissions: {read: "taskRequest"},
                            field: {
                                name: "taskRequest.mainImage",
                                widget: "#GalleryCarousel",
                                widgetProps: {
                                    imageGalleryField: "taskRequest.imageGallery",
                                    showThumbnails: false,
                                    allowFullScreen: false,
                                    coverAfterFirst: false,
                                    showPreviews: true,
                                    previewLocation: "right",
                                },
                            },
                        },
                    ],
                },
            ],
        },
        // Once the provider's quote won: where the work is and whom to call (D143); the server sends these only then.
        {
            render: "#SheetGroup",
            props: {title: "client"},
            dependent: "taskRequest.requester",
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            dependent: "taskRequest.requester.name",
                            permissions: {read: "taskRequest"},
                            field: {name: "taskRequest.requester.name", widget: "#DisplayCard", label: "clientName", widgetProps: {icon: "#User", valuePath: ["taskRequest.requester.name", "taskRequest.requester.surname"], joinSeparator: " "}},
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "taskRequest.requester.username",
                            permissions: {read: "taskRequest"},
                            field: {name: "taskRequest.requester.username", widget: "#DisplayCard", label: "clientEmail", widgetProps: {icon: "#Mail", type: "email"}},
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "taskRequest.requester.phoneNumber",
                            permissions: {read: "taskRequest"},
                            field: {name: "taskRequest.requester.phoneNumber", widget: "#DisplayCard", label: "clientPhone", widgetProps: {icon: "#Phone"}},
                        },
                        {
                            render: "#DisplayCard",
                            dependent: "taskRequest.address.street",
                            permissions: {read: "taskRequest"},
                            field: {name: "taskRequest.address.street", widget: "#DisplayCard", label: "street", widgetProps: {icon: "#MapPin", valuePath: ["taskRequest.address.street", "taskRequest.address.postalCode", "taskRequest.address.city.name"], joinSeparator: ", "}},
                        },
                    ],
                },
                {
                    render: "div",
                    dependent: "taskRequest.address.latitude",
                    props: {className: "w-full pt-2"},
                    children: [
                        {
                            render: "#SheetLocationMap",
                            permissions: {read: "taskRequest"},
                            field: {name: "taskRequest.address", widget: "#SheetLocationMap", widgetProps: {addressField: "taskRequest.address"}},
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "job"},
            dependent: "taskRequest",
            children: [
                // On-site work before the award: the facts beside the area map, laid out like a company's address card. The
                // area's centre is moved from the pin, so it never gives the address away (D148).
                {
                    render: "div",
                    dependent: "taskRequest.approxPoint",
                    props: {className: "grid grid-cols-1 min-[640px]:grid-cols-3 gap-3 items-stretch"},
                    children: [
                        {render: "div", props: {className: "min-[640px]:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2 h-fit"}, children: jobCards},
                        {
                            render: "div",
                            props: {className: "relative self-stretch min-h-[220px] min-[640px]:min-h-0 min-[640px]:col-span-1"},
                            children: [
                                {
                                    render: "#SheetLocationMap",
                                    permissions: {read: "taskRequest"},
                                    field: {
                                        name: "taskRequest.approxPoint",
                                        widget: "#SheetLocationMap",
                                        widgetProps: {addressField: "taskRequest.approxPoint", areaRadiusM: JOB_AREA_RADIUS_M, className: "absolute inset-0 h-full w-full overflow-hidden rounded-lg"},
                                    },
                                },
                            ],
                        },
                    ],
                },
                // Remote work, or a won lead (its exact pin is in the client group): the facts across the group.
                {render: "#SheetGrid", props: {columns: 2, watchField: "taskRequest.approxPoint.latitude", whenValues: [""]}, children: jobCards},
                {
                    render: "div",
                    dependent: "taskRequest.description",
                    props: {className: "p-4 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "taskRequest"},
                            field: {name: "taskRequest.description", widget: "#ExpandableText", label: "description"},
                        },
                    ],
                },
            ],
        },
        {
            render: "#SheetGroup",
            props: {title: "quote"},
            dependent: "bid",
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
                        {
                            render: "#DisplayCard",
                            permissions: {read: "bid"},
                            field: {
                                name: "bid.amount",
                                widget: "#DisplayCard",
                                label: "quoteAmount",
                                widgetProps: {icon: "#DollarSign", format: "locale", valuePath: ["bid.currency.symbol", "bid.amount"], joinSeparator: " ", type: "currency"},
                            },
                        },
                        {
                            render: "#DisplayCard",
                            permissions: {read: "bid"},
                            field: {name: "bid.deliveryDays", widget: "#DisplayCard", label: "deliveryDays", widgetProps: {icon: "#Clock", valueTemplateKey: "deliveryDaysValue"}},
                        },
                    ],
                },
                {
                    render: "div",
                    props: {className: "p-4 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "bid"},
                            field: {name: "bid.proposal", widget: "#ExpandableText", label: "proposal"},
                        },
                    ],
                },
            ],
        },
        lifecycleSheetGroup,
    ],
};

export const taskLeadViews: ViewConfig[] = [taskLeadSheetView];
