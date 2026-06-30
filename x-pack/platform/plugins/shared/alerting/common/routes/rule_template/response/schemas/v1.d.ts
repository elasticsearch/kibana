export declare const ruleTemplateResponseSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    name: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    rule_type_id: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
    alert_delay: import("@kbn/config-schema").Type<Readonly<{} & {
        active: number;
    }> | undefined>;
    flapping: import("@kbn/config-schema").Type<Readonly<{
        enabled?: boolean | undefined;
    } & {
        look_back_window: number;
        status_change_threshold: number;
    }> | null | undefined>;
    description: import("@kbn/config-schema").Type<string | undefined>;
    artifacts: import("@kbn/config-schema").Type<Readonly<{
        investigation_guide?: Readonly<{} & {
            blob: string;
        }> | undefined;
        dashboards?: Readonly<{} & {
            id: string;
        }>[] | undefined;
    } & {}> | undefined>;
}>;
