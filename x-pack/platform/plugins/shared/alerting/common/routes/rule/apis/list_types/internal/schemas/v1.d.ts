export declare const getRuleTypesInternalResponseBodySchema: import("@kbn/config-schema").Type<Readonly<{
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
    solution: "security" | "observability" | "stack";
    has_alerts_mappings: boolean;
    is_internally_managed: boolean;
}>[]>;
export declare const getRuleTypesInternalResponseSchema: import("@kbn/config-schema").ObjectType<{
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
        solution: "security" | "observability" | "stack";
        has_alerts_mappings: boolean;
        is_internally_managed: boolean;
    }>[]>;
}>;
