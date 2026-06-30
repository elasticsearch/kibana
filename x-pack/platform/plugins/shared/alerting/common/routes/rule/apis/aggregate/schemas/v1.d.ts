export declare const aggregateRulesRequestBodySchema: import("@kbn/config-schema").ObjectType<{
    search: import("@kbn/config-schema").Type<string | undefined>;
    default_search_operator: import("@kbn/config-schema").Type<"AND" | "OR">;
    search_fields: import("@kbn/config-schema").Type<string[] | undefined>;
    has_reference: import("@kbn/config-schema").Type<Readonly<{} & {
        type: string;
        id: string;
    }> | null | undefined>;
    filter: import("@kbn/config-schema").Type<string | undefined>;
    rule_type_ids: import("@kbn/config-schema").Type<string[] | undefined>;
    consumers: import("@kbn/config-schema").Type<string[] | undefined>;
}>;
export declare const aggregateRulesResponseBodySchema: import("@kbn/config-schema").ObjectType<{
    rule_execution_status: import("@kbn/config-schema").Type<Record<string, number>>;
    rule_last_run_outcome: import("@kbn/config-schema").Type<Record<string, number>>;
    rule_enabled_status: import("@kbn/config-schema").ObjectType<{
        enabled: import("@kbn/config-schema").Type<number>;
        disabled: import("@kbn/config-schema").Type<number>;
    }>;
    rule_muted_status: import("@kbn/config-schema").ObjectType<{
        muted: import("@kbn/config-schema").Type<number>;
        unmuted: import("@kbn/config-schema").Type<number>;
    }>;
    rule_snoozed_status: import("@kbn/config-schema").ObjectType<{
        snoozed: import("@kbn/config-schema").Type<number>;
    }>;
    rule_tags: import("@kbn/config-schema").Type<string[]>;
}>;
