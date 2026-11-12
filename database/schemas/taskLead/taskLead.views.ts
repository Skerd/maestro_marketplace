import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

/**
 * A provider's lead (D143): the job as they may see it before the award (city level, no street, postcode, pin or
 * buyer), how far it is, and the quote they placed.
 */
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
        {
            render: "#SheetGroup",
            props: {title: "job"},
            dependent: "taskRequest",
            children: [
                {
                    render: "#SheetGrid",
                    props: {columns: 2},
                    children: [
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
                            dependent: "taskRequest.budgetMin",
                            permissions: {read: "taskRequest"},
                            field: {
                                name: "taskRequest.budgetMin",
                                widget: "#DisplayCard",
                                label: "budgetMin",
                                widgetProps: {icon: "#DollarSign", format: "locale", valuePath: ["taskRequest.currency.symbol", "taskRequest.budgetMin"], joinSeparator: " ", type: "currency"},
                            },
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
                    ],
                },
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
