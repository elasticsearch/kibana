export declare const rawRuleTemplateSchema: import("@kbn/config-schema").ObjectType<{
    name: import("@kbn/config-schema").Type<string>;
    tags: import("@kbn/config-schema").Type<string[]>;
    ruleTypeId: import("@kbn/config-schema").Type<string>;
    schedule: import("@kbn/config-schema").ObjectType<{
        interval: import("@kbn/config-schema").Type<string>;
    }>;
    flapping: import("@kbn/config-schema").Type<Readonly<{} & {
        lookBackWindow: number;
        statusChangeThreshold: number;
    }> | null | undefined>;
    alertDelay: import("@kbn/config-schema").Type<Readonly<{} & {
        active: number;
    }> | undefined>;
    params: import("@kbn/config-schema").Type<Record<string, any>>;
}>;
