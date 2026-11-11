import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";
import {lifecycleSheetGroup} from "@coreModule/database/schemas/shared/lifecycleSheetGroup";

export const listingFlagSheetView: ViewConfig = {
    model: "listingflags",
    viewType: "sheet",
    accessModel: "listingflags",
    apiUrl: "/api/marketplace/listingFlag",
    header: {
        titleField: "status",
        titleFieldLanguageCategory: "status_values",
        subtitleKey: "listingFlagSubtitle",
        showCloseButton: true,
    },
    nodes: [
        {
            // Status, listing and reason are in the header (UX-01); the listing card is kept for its link.
            render: "#SheetGroup",
            props: {title: "overview"},
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
                                label: "listing",
                                widgetProps: {
                                    icon: "#LayoutList",
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
                            dependent: "user",
                            permissions: {read: "user"},
                            field: {
                                name: "user",
                                widget: "#DisplayCard",
                                label: "user",
                                widgetProps: {
                                    icon: "#User",
                                    valuePath: ["user.name", "user.surname"],
                                    joinSeparator: " ",
                                    linkedRefPath: "user",
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
            props: {title: "comment"},
            dependent: "comment",
            permissions: {read: "comment"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "comment"},
                            field: {
                                name: "comment",
                                widget: "#ExpandableText",
                                label: "comment",
                                widgetProps: {className: "text-sm"},
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
            permissions: {read: "resolution"},
            children: [
                {
                    render: "div",
                    props: {className: "p-2 rounded-lg bg-muted/30 border border-border/50"},
                    children: [
                        {
                            render: "#ExpandableText",
                            permissions: {read: "resolution"},
                            field: {
                                name: "resolution",
                                widget: "#ExpandableText",
                                label: "resolution",
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

const reasonOptions = [
    {value: "inappropriate", label: "form.reason_values.inappropriate"},
    {value: "spam", label: "form.reason_values.spam"},
    {value: "misleading", label: "form.reason_values.misleading"},
    {value: "other", label: "form.reason_values.other"},
];

const listingFlagCreateFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.reportSectionTitle"},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        field: {
                            name: "listing",
                            widget: "#ApiSelect",
                            label: "form.listingLabel",
                            placeholder: "form.listingPlaceholder",
                            required: true,
                            widgetProps: {apiUrl: "/api/marketplace/listing/select"},
                        },
                    },
                    {
                        render: "#Field",
                        field: {
                            name: "reason",
                            widget: "#SimpleSelect",
                            label: "form.reasonLabel",
                            placeholder: "form.reasonPlaceholder",
                            required: true,
                            widgetProps: {options: reasonOptions, className: "grow w-full"},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                field: {
                    name: "comment",
                    widget: "#Textarea",
                    label: "form.commentLabel",
                    placeholder: "form.commentPlaceholder",
                    widgetProps: {className: "min-h-[100px] max-h-[200px] resize-none overflow-y-auto"},
                },
            },
        ],
    },
];

/** The listing is fixed once reported; only the reason and the details change. */
const listingFlagEditFormNodes: ViewConfig["nodes"] = [
    {
        render: "#TitleWithCollapse",
        props: {title: "form.reportSectionTitle"},
        permissions: {readAny: ["reason", "comment"], writeAny: ["reason", "comment"]},
        children: [
            {
                render: "#FormGrid",
                props: {columns: 2},
                children: [
                    {
                        render: "#Field",
                        permissions: {read: "reason", write: "reason"},
                        field: {
                            name: "reason",
                            widget: "#SimpleSelect",
                            label: "form.reasonLabel",
                            placeholder: "form.reasonPlaceholder",
                            required: true,
                            widgetProps: {options: reasonOptions, className: "grow w-full"},
                        },
                    },
                ],
            },
            {
                render: "#Field",
                permissions: {read: "comment", write: "comment"},
                field: {
                    name: "comment",
                    widget: "#Textarea",
                    label: "form.commentLabel",
                    placeholder: "form.commentPlaceholder",
                    widgetProps: {className: "min-h-[100px] max-h-[200px] resize-none overflow-y-auto"},
                },
            },
        ],
    },
];

export const listingFlagCreateFormView: ViewConfig = {
    model: "listingflags",
    viewType: "form",
    viewMode: "create",
    accessModel: "listingflags",
    apiUrl: "/api/marketplace/listingFlag",
    method: "PUT",
    nodes: listingFlagCreateFormNodes,
};

export const listingFlagEditFormView: ViewConfig = {
    model: "listingflags",
    viewType: "form",
    viewMode: "edit",
    accessModel: "listingflags",
    apiUrl: "/api/marketplace/listingFlag",
    method: "PATCH",
    nodes: listingFlagEditFormNodes,
};

export const listingFlagViews: ViewConfig[] = [
    listingFlagSheetView,
    listingFlagCreateFormView,
    listingFlagEditFormView,
];
