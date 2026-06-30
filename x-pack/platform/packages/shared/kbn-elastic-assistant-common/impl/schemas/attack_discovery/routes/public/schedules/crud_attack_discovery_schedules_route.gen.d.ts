import { z } from '@kbn/zod/v4';
/**
 * Response body shape for Attack discovery schedule create, read, update, enable, and disable operations. Fields vary by endpoint; refer to each operation’s schema and examples.
 */
export declare const AttackDiscoveryGenericResponse: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
export type AttackDiscoveryGenericResponse = z.infer<typeof AttackDiscoveryGenericResponse>;
/**
 * Error response for Attack discovery schedule operations when the request is rejected. Uses `status_code` (snake_case), `error`, and `message` to match the implementation.
 */
export declare const AttackDiscoveryGenericError: z.ZodObject<{
    status_code: z.ZodOptional<z.ZodNumber>;
    error: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryGenericError = z.infer<typeof AttackDiscoveryGenericError>;
export declare const BulkActionAttackDiscoverySchedulesRequestBody: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BulkActionAttackDiscoverySchedulesRequestBody = z.infer<typeof BulkActionAttackDiscoverySchedulesRequestBody>;
export declare const BulkActionAttackDiscoverySchedulesError: z.ZodObject<{
    message: z.ZodString;
    status: z.ZodOptional<z.ZodNumber>;
    rule: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type BulkActionAttackDiscoverySchedulesError = z.infer<typeof BulkActionAttackDiscoverySchedulesError>;
export declare const BulkActionAttackDiscoverySchedulesResponse: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
    errors: z.ZodArray<z.ZodObject<{
        message: z.ZodString;
        status: z.ZodOptional<z.ZodNumber>;
        rule: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export type BulkActionAttackDiscoverySchedulesResponse = z.infer<typeof BulkActionAttackDiscoverySchedulesResponse>;
export declare const BulkDeleteAttackDiscoverySchedulesRequestBody: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BulkDeleteAttackDiscoverySchedulesRequestBody = z.infer<typeof BulkDeleteAttackDiscoverySchedulesRequestBody>;
export type BulkDeleteAttackDiscoverySchedulesRequestBodyInput = z.input<typeof BulkDeleteAttackDiscoverySchedulesRequestBody>;
export declare const BulkDeleteAttackDiscoverySchedulesResponse: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
    errors: z.ZodArray<z.ZodObject<{
        message: z.ZodString;
        status: z.ZodOptional<z.ZodNumber>;
        rule: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export type BulkDeleteAttackDiscoverySchedulesResponse = z.infer<typeof BulkDeleteAttackDiscoverySchedulesResponse>;
export declare const BulkDisableAttackDiscoverySchedulesRequestBody: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BulkDisableAttackDiscoverySchedulesRequestBody = z.infer<typeof BulkDisableAttackDiscoverySchedulesRequestBody>;
export type BulkDisableAttackDiscoverySchedulesRequestBodyInput = z.input<typeof BulkDisableAttackDiscoverySchedulesRequestBody>;
export declare const BulkDisableAttackDiscoverySchedulesResponse: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
    errors: z.ZodArray<z.ZodObject<{
        message: z.ZodString;
        status: z.ZodOptional<z.ZodNumber>;
        rule: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export type BulkDisableAttackDiscoverySchedulesResponse = z.infer<typeof BulkDisableAttackDiscoverySchedulesResponse>;
export declare const BulkEnableAttackDiscoverySchedulesRequestBody: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BulkEnableAttackDiscoverySchedulesRequestBody = z.infer<typeof BulkEnableAttackDiscoverySchedulesRequestBody>;
export type BulkEnableAttackDiscoverySchedulesRequestBodyInput = z.input<typeof BulkEnableAttackDiscoverySchedulesRequestBody>;
export declare const BulkEnableAttackDiscoverySchedulesResponse: z.ZodObject<{
    ids: z.ZodArray<z.ZodString>;
    errors: z.ZodArray<z.ZodObject<{
        message: z.ZodString;
        status: z.ZodOptional<z.ZodNumber>;
        rule: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    total: z.ZodNumber;
}, z.core.$strip>;
export type BulkEnableAttackDiscoverySchedulesResponse = z.infer<typeof BulkEnableAttackDiscoverySchedulesResponse>;
export declare const CreateAttackDiscoverySchedulesRequestBody: z.ZodObject<{
    name: z.ZodString;
    enabled: z.ZodOptional<z.ZodBoolean>;
    params: z.ZodObject<{
        alerts_index_pattern: z.ZodString;
        api_config: z.ZodObject<{
            connectorId: z.ZodString;
            actionTypeId: z.ZodString;
            defaultSystemPromptId: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodEnum<{
                OpenAI: "OpenAI";
                "Azure OpenAI": "Azure OpenAI";
                Other: "Other";
            }>>;
            model: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
        }, z.core.$strip>;
        end: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodObject<{
            query: z.ZodUnion<readonly [z.ZodString, z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>]>;
            language: z.ZodString;
        }, z.core.$strip>>;
        filters: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
        combined_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        action_type_id: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alerts_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notify_when: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        action_type_id: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>>;
}, z.core.$strip>;
export type CreateAttackDiscoverySchedulesRequestBody = z.infer<typeof CreateAttackDiscoverySchedulesRequestBody>;
export type CreateAttackDiscoverySchedulesRequestBodyInput = z.input<typeof CreateAttackDiscoverySchedulesRequestBody>;
export declare const CreateAttackDiscoverySchedulesResponse: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    created_by: z.ZodString;
    updated_by: z.ZodString;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    enabled: z.ZodBoolean;
    params: z.ZodObject<{
        alerts_index_pattern: z.ZodString;
        api_config: z.ZodObject<{
            connectorId: z.ZodString;
            actionTypeId: z.ZodString;
            defaultSystemPromptId: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodEnum<{
                OpenAI: "OpenAI";
                "Azure OpenAI": "Azure OpenAI";
                Other: "Other";
            }>>;
            model: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
        }, z.core.$strip>;
        end: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodObject<{
            query: z.ZodUnion<readonly [z.ZodString, z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>]>;
            language: z.ZodString;
        }, z.core.$strip>>;
        filters: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
        combined_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        action_type_id: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alerts_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notify_when: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        action_type_id: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>;
    last_execution: z.ZodOptional<z.ZodObject<{
        date: z.ZodString;
        duration: z.ZodOptional<z.ZodNumber>;
        status: z.ZodEnum<{
            warning: "warning";
            error: "error";
            unknown: "unknown";
            active: "active";
            ok: "ok";
        }>;
        message: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CreateAttackDiscoverySchedulesResponse = z.infer<typeof CreateAttackDiscoverySchedulesResponse>;
export declare const DeleteAttackDiscoverySchedulesRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DeleteAttackDiscoverySchedulesRequestParams = z.infer<typeof DeleteAttackDiscoverySchedulesRequestParams>;
export type DeleteAttackDiscoverySchedulesRequestParamsInput = z.input<typeof DeleteAttackDiscoverySchedulesRequestParams>;
export declare const DeleteAttackDiscoverySchedulesResponse: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DeleteAttackDiscoverySchedulesResponse = z.infer<typeof DeleteAttackDiscoverySchedulesResponse>;
export declare const DisableAttackDiscoverySchedulesRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DisableAttackDiscoverySchedulesRequestParams = z.infer<typeof DisableAttackDiscoverySchedulesRequestParams>;
export type DisableAttackDiscoverySchedulesRequestParamsInput = z.input<typeof DisableAttackDiscoverySchedulesRequestParams>;
export declare const DisableAttackDiscoverySchedulesResponse: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DisableAttackDiscoverySchedulesResponse = z.infer<typeof DisableAttackDiscoverySchedulesResponse>;
export declare const EnableAttackDiscoverySchedulesRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type EnableAttackDiscoverySchedulesRequestParams = z.infer<typeof EnableAttackDiscoverySchedulesRequestParams>;
export type EnableAttackDiscoverySchedulesRequestParamsInput = z.input<typeof EnableAttackDiscoverySchedulesRequestParams>;
export declare const EnableAttackDiscoverySchedulesResponse: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type EnableAttackDiscoverySchedulesResponse = z.infer<typeof EnableAttackDiscoverySchedulesResponse>;
export declare const GetAttackDiscoverySchedulesRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type GetAttackDiscoverySchedulesRequestParams = z.infer<typeof GetAttackDiscoverySchedulesRequestParams>;
export type GetAttackDiscoverySchedulesRequestParamsInput = z.input<typeof GetAttackDiscoverySchedulesRequestParams>;
export declare const GetAttackDiscoverySchedulesResponse: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    created_by: z.ZodString;
    updated_by: z.ZodString;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    enabled: z.ZodBoolean;
    params: z.ZodObject<{
        alerts_index_pattern: z.ZodString;
        api_config: z.ZodObject<{
            connectorId: z.ZodString;
            actionTypeId: z.ZodString;
            defaultSystemPromptId: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodEnum<{
                OpenAI: "OpenAI";
                "Azure OpenAI": "Azure OpenAI";
                Other: "Other";
            }>>;
            model: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
        }, z.core.$strip>;
        end: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodObject<{
            query: z.ZodUnion<readonly [z.ZodString, z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>]>;
            language: z.ZodString;
        }, z.core.$strip>>;
        filters: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
        combined_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        action_type_id: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alerts_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notify_when: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        action_type_id: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>;
    last_execution: z.ZodOptional<z.ZodObject<{
        date: z.ZodString;
        duration: z.ZodOptional<z.ZodNumber>;
        status: z.ZodEnum<{
            warning: "warning";
            error: "error";
            unknown: "unknown";
            active: "active";
            ok: "ok";
        }>;
        message: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GetAttackDiscoverySchedulesResponse = z.infer<typeof GetAttackDiscoverySchedulesResponse>;
export declare const UpdateAttackDiscoverySchedulesRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type UpdateAttackDiscoverySchedulesRequestParams = z.infer<typeof UpdateAttackDiscoverySchedulesRequestParams>;
export type UpdateAttackDiscoverySchedulesRequestParamsInput = z.input<typeof UpdateAttackDiscoverySchedulesRequestParams>;
export declare const UpdateAttackDiscoverySchedulesRequestBody: z.ZodObject<{
    name: z.ZodString;
    params: z.ZodObject<{
        alerts_index_pattern: z.ZodString;
        api_config: z.ZodObject<{
            connectorId: z.ZodString;
            actionTypeId: z.ZodString;
            defaultSystemPromptId: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodEnum<{
                OpenAI: "OpenAI";
                "Azure OpenAI": "Azure OpenAI";
                Other: "Other";
            }>>;
            model: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
        }, z.core.$strip>;
        end: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodObject<{
            query: z.ZodUnion<readonly [z.ZodString, z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>]>;
            language: z.ZodString;
        }, z.core.$strip>>;
        filters: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
        combined_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        action_type_id: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alerts_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notify_when: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        action_type_id: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>;
}, z.core.$strip>;
export type UpdateAttackDiscoverySchedulesRequestBody = z.infer<typeof UpdateAttackDiscoverySchedulesRequestBody>;
export type UpdateAttackDiscoverySchedulesRequestBodyInput = z.input<typeof UpdateAttackDiscoverySchedulesRequestBody>;
export declare const UpdateAttackDiscoverySchedulesResponse: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    created_by: z.ZodString;
    updated_by: z.ZodString;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    enabled: z.ZodBoolean;
    params: z.ZodObject<{
        alerts_index_pattern: z.ZodString;
        api_config: z.ZodObject<{
            connectorId: z.ZodString;
            actionTypeId: z.ZodString;
            defaultSystemPromptId: z.ZodOptional<z.ZodString>;
            provider: z.ZodOptional<z.ZodEnum<{
                OpenAI: "OpenAI";
                "Azure OpenAI": "Azure OpenAI";
                Other: "Other";
            }>>;
            model: z.ZodOptional<z.ZodString>;
            name: z.ZodString;
        }, z.core.$strip>;
        end: z.ZodOptional<z.ZodString>;
        query: z.ZodOptional<z.ZodObject<{
            query: z.ZodUnion<readonly [z.ZodString, z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>]>;
            language: z.ZodString;
        }, z.core.$strip>>;
        filters: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
        combined_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        action_type_id: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alerts_filter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notify_when: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        action_type_id: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>;
    last_execution: z.ZodOptional<z.ZodObject<{
        date: z.ZodString;
        duration: z.ZodOptional<z.ZodNumber>;
        status: z.ZodEnum<{
            warning: "warning";
            error: "error";
            unknown: "unknown";
            active: "active";
            ok: "ok";
        }>;
        message: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type UpdateAttackDiscoverySchedulesResponse = z.infer<typeof UpdateAttackDiscoverySchedulesResponse>;
