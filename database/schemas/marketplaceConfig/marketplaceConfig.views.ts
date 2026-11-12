import type {ViewConfig} from "armonia/src/modules/core/api/auxiliary/private/viewConfig";

const API_URL = "/api/marketplace/marketplaceConfig";

/** One settings record, edited in place under Configurations → Marketplace. */
export const marketplaceConfigEditFormView: ViewConfig = {
    model: "marketplaceconfigs",
    viewType: "form",
    viewMode: "edit",
    accessModel: "marketplaceconfigs",
    apiUrl: API_URL,
    method: "PATCH",
    nodes: [
        {
            render: "#TitleWithCollapse",
            props: {title: "form.settingsSectionTitle"},
            permissions: {readAny: ["listedOnPortal", "currency"], writeAny: ["listedOnPortal", "currency"]},
            children: [
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#Field",
                            permissions: {read: "listedOnPortal", write: "listedOnPortal"},
                            field: {
                                name: "listedOnPortal",
                                widget: "#Switch",
                                label: "form.listedOnPortalLabel",
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {read: "currency", write: "currency"},
                            field: {
                                name: "currency",
                                widget: "#ApiSelect",
                                label: "form.currencyLabel",
                                placeholder: "form.currencyPlaceholder",
                                required: true,
                                widgetProps: {
                                    apiUrl: "/api/finance/currency/select",
                                    method: "POST",
                                    pageSize: 50,
                                },
                            },
                        },
                    ],
                },
            ],
        },
        {
            // The marketplace operator's own settings (D143); the settings page passes `isOperator` as a form extra.
            render: "#TitleWithCollapse",
            props: {title: "form.operatorSectionTitle", skipRenderWhenFormExtraNotTruthy: "isOperator"},
            permissions: {readAny: ["leadCap", "openJobLimit"], writeAny: ["leadCap", "openJobLimit"]},
            children: [
                {render: "#FormAlert", props: {message: "form.operatorSectionHint"}},
                {
                    render: "#FormGrid",
                    props: {columns: 3},
                    children: [
                        {
                            render: "#Field",
                            permissions: {read: "leadCap", write: "leadCap"},
                            field: {
                                name: "leadCap",
                                widget: "#Input",
                                label: "form.leadCapLabel",
                                placeholder: "form.leadCapPlaceholder",
                                widgetProps: {type: "number", min: 1, max: 50, step: 1},
                            },
                        },
                        {
                            render: "#Field",
                            permissions: {read: "openJobLimit", write: "openJobLimit"},
                            field: {
                                name: "openJobLimit",
                                widget: "#Input",
                                label: "form.openJobLimitLabel",
                                placeholder: "form.openJobLimitPlaceholder",
                                widgetProps: {type: "number", min: 1, max: 50, step: 1},
                            },
                        },
                    ],
                },
            ],
        },
    ],
};

export const marketplaceConfigViews: ViewConfig[] = [marketplaceConfigEditFormView];
