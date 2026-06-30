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
