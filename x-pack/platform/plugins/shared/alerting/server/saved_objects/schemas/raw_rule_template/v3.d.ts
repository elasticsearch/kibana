export declare const investigationGuideSchema: import("@kbn/config-schema").ObjectType<{
    blob: import("@kbn/config-schema").Type<string>;
}>;
export declare const dashboardsSchema: import("@kbn/config-schema").Type<Readonly<{} & {
    id: string;
}>[]>;
export declare const artifactsSchema: import("@kbn/config-schema").ObjectType<{
    dashboards: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
    }>[] | undefined>;
    investigation_guide: import("@kbn/config-schema").Type<Readonly<{} & {
        blob: string;
    }> | undefined>;
}>;
export declare const rawRuleTemplateSchema: import("@kbn/config-schema").ObjectType<Omit<{
    name: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    ruleTypeId: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    flapping: import("@kbn/config-schema").Type<Readonly<{
        enabled?: boolean | undefined;
    } & {
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | null | undefined>;
    alertDelay: import("@kbn/config-schema").Type<Readonly<{} & {
        active: number;
    }> | undefined>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
}, "artifacts" | "description"> & {
    artifacts: import("@kbn/config-schema").Type<Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            id: string;
        }>[] | undefined;
    } & {}> | undefined>;
    description: import("@kbn/config-schema").Type<string | undefined>;
}>;
