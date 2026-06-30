export declare const actionVariableSchema: import("@kbn/config-schema").ObjectType<{
    name: import("@kbn/config-schema").Type<string>;
    description: import("@kbn/config-schema").Type<string>;
    usesPublicBaseUrl: import("@kbn/config-schema").Type<boolean | undefined>;
}>;
export declare const actionGroupSchema: import("@kbn/config-schema").ObjectType<{
    id: import("@kbn/config-schema").Type<string>;
    name: import("@kbn/config-schema").Type<string>;
}>;
export declare const typesRulesSchema: import("@kbn/config-schema").ObjectType<{
    action_groups: import("@kbn/config-schema").Type<Readonly<{} & {
        id: string;
        name: string;
    }>[] | undefined>;
    action_variables: import("@kbn/config-schema").Type<Readonly<{
        params?: Readonly<{
            usesPublicBaseUrl?: boolean | undefined;
        } & {
            name: string;
            description: string;
        }>[] | undefined;
        context?: Readonly<{
            usesPublicBaseUrl?: boolean | undefined;
        } & {
            name: string;
            description: string;
        }>[] | undefined;
        state?: Readonly<{
            usesPublicBaseUrl?: boolean | undefined;
        } & {
            name: string;
            description: string;
        }>[] | undefined;
    } & {}> | undefined>;
    alerts: import("@kbn/config-schema").Type<Readonly<{
        mappings?: Readonly<{
            dynamic?: false | "strict" | undefined;
            shouldWrite?: boolean | undefined;
            useEcs?: boolean | undefined;
        } & {
            fieldMap: Record<string, any>;
        }> | undefined;
    } & {
        context: string;
    }> | undefined>;
    authorized_consumers: import("@kbn/config-schema").Type<Record<string, Readonly<{} & {
        all: boolean;
        read: boolean;
    }>>>;
    auto_recover_alerts: import("@kbn/config-schema").Type<boolean | undefined>;
    category: import("@kbn/config-schema").Type<string>;
    default_action_group_id: import("@kbn/config-schema").Type<string>;
    default_schedule_interval: import("@kbn/config-schema").Type<string | undefined>;
    does_set_recovery_context: import("@kbn/config-schema").Type<boolean | undefined>;
    enabled_in_license: import("@kbn/config-schema").Type<boolean>;
    fieldsForAAD: import("@kbn/config-schema").Type<string[] | undefined>;
    has_alerts_mappings: import("@kbn/config-schema").Type<boolean>;
    has_fields_for_a_a_d: import("@kbn/config-schema").Type<boolean>;
    id: import("@kbn/config-schema").Type<string>;
    is_internally_managed: import("@kbn/config-schema").Type<boolean>;
    is_exportable: import("@kbn/config-schema").Type<boolean>;
    minimum_license_required: import("@kbn/config-schema").Type<"gold" | "basic" | "platinum" | "standard" | "enterprise" | "trial">;
    name: import("@kbn/config-schema").Type<string>;
    producer: import("@kbn/config-schema").Type<string>;
    recovery_action_group: import("@kbn/config-schema").ObjectType<{
        id: import("@kbn/config-schema").Type<string>;
        name: import("@kbn/config-schema").Type<string>;
    }>;
    rule_task_timeout: import("@kbn/config-schema").Type<string | undefined>;
}>;
export declare const typesRulesResponseBodySchema: import("@kbn/config-schema").Type<Readonly<{
    alerts?: Readonly<{
        mappings?: Readonly<{
            dynamic?: false | "strict" | undefined;
            shouldWrite?: boolean | undefined;
            useEcs?: boolean | undefined;
        } & {
            fieldMap: Record<string, any>;
        }> | undefined;
    } & {
        context: string;
    }> | undefined;
    action_groups?: Readonly<{} & {
        id: string;
        name: string;
    }>[] | undefined;
    action_variables?: Readonly<{
        params?: Readonly<{
            usesPublicBaseUrl?: boolean | undefined;
        } & {
            name: string;
            description: string;
        }>[] | undefined;
        context?: Readonly<{
            usesPublicBaseUrl?: boolean | undefined;
        } & {
            name: string;
            description: string;
        }>[] | undefined;
        state?: Readonly<{
            usesPublicBaseUrl?: boolean | undefined;
        } & {
            name: string;
            description: string;
        }>[] | undefined;
    } & {}> | undefined;
    rule_task_timeout?: string | undefined;
    default_schedule_interval?: string | undefined;
    does_set_recovery_context?: boolean | undefined;
    auto_recover_alerts?: boolean | undefined;
    fieldsForAAD?: string[] | undefined;
} & {
    id: string;
    name: string;
    category: string;
    producer: string;
    recovery_action_group: Readonly<{} & {
        id: string;
        name: string;
    }>;
    default_action_group_id: string;
    minimum_license_required: "gold" | "basic" | "platinum" | "standard" | "enterprise" | "trial";
    is_exportable: boolean;
    enabled_in_license: boolean;
    authorized_consumers: Record<string, Readonly<{} & {
        all: boolean;
        read: boolean;
    }>>;
    has_alerts_mappings: boolean;
    has_fields_for_a_a_d: boolean;
    is_internally_managed: boolean;
}>[]>;
export declare const typesRulesResponseSchema: import("@kbn/config-schema").ObjectType<{
    body: import("@kbn/config-schema").Type<Readonly<{
        alerts?: Readonly<{
            mappings?: Readonly<{
                dynamic?: false | "strict" | undefined;
                shouldWrite?: boolean | undefined;
                useEcs?: boolean | undefined;
            } & {
                fieldMap: Record<string, any>;
            }> | undefined;
        } & {
            context: string;
        }> | undefined;
        action_groups?: Readonly<{} & {
            id: string;
            name: string;
        }>[] | undefined;
        action_variables?: Readonly<{
            params?: Readonly<{
                usesPublicBaseUrl?: boolean | undefined;
            } & {
                name: string;
                description: string;
            }>[] | undefined;
            context?: Readonly<{
                usesPublicBaseUrl?: boolean | undefined;
            } & {
                name: string;
                description: string;
            }>[] | undefined;
            state?: Readonly<{
                usesPublicBaseUrl?: boolean | undefined;
            } & {
                name: string;
                description: string;
            }>[] | undefined;
        } & {}> | undefined;
        rule_task_timeout?: string | undefined;
        default_schedule_interval?: string | undefined;
        does_set_recovery_context?: boolean | undefined;
        auto_recover_alerts?: boolean | undefined;
        fieldsForAAD?: string[] | undefined;
    } & {
        id: string;
        name: string;
        category: string;
        producer: string;
        recovery_action_group: Readonly<{} & {
            id: string;
            name: string;
        }>;
        default_action_group_id: string;
        minimum_license_required: "gold" | "basic" | "platinum" | "standard" | "enterprise" | "trial";
        is_exportable: boolean;
        enabled_in_license: boolean;
        authorized_consumers: Record<string, Readonly<{} & {
            all: boolean;
            read: boolean;
        }>>;
        has_alerts_mappings: boolean;
        has_fields_for_a_a_d: boolean;
        is_internally_managed: boolean;
    }>[]>;
}>;
