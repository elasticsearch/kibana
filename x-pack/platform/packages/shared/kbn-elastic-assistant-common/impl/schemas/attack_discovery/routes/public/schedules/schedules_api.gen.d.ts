import { z } from '@kbn/zod/v4';
/**
 * An query condition to filter alerts
 */
export declare const Query: z.ZodObject<{
    query: z.ZodUnion<readonly [z.ZodString, z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>]>;
    language: z.ZodString;
}, z.core.$strip>;
export type Query = z.infer<typeof Query>;
/**
 * The filter array used to define the conditions for when alerts are selected as an Attack Discovery context. Defaults to an empty array.
 */
export declare const Filters: z.ZodArray<z.ZodUnknown>;
export type Filters = z.infer<typeof Filters>;
/**
 * An Attack Discovery schedule params
 */
export declare const AttackDiscoveryApiScheduleParams: z.ZodObject<{
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
export type AttackDiscoveryApiScheduleParams = z.infer<typeof AttackDiscoveryApiScheduleParams>;
export declare const IntervalApiSchedule: z.ZodObject<{
    interval: z.ZodString;
}, z.core.$strip>;
export type IntervalApiSchedule = z.infer<typeof IntervalApiSchedule>;
/**
 * Groups actions by use cases. Use `default` for alert notifications.
 */
export declare const AttackDiscoveryApiScheduleActionGroup: z.ZodString;
export type AttackDiscoveryApiScheduleActionGroup = z.infer<typeof AttackDiscoveryApiScheduleActionGroup>;
/**
 * The connector ID.
 */
export declare const AttackDiscoveryApiScheduleActionId: z.ZodString;
export type AttackDiscoveryApiScheduleActionId = z.infer<typeof AttackDiscoveryApiScheduleActionId>;
/**
 * Object containing the allowed connector fields, which varies according to the connector type.
 */
export declare const AttackDiscoveryApiScheduleActionParams: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
export type AttackDiscoveryApiScheduleActionParams = z.infer<typeof AttackDiscoveryApiScheduleActionParams>;
export declare const AttackDiscoveryApiScheduleActionAlertsFilter: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
export type AttackDiscoveryApiScheduleActionAlertsFilter = z.infer<typeof AttackDiscoveryApiScheduleActionAlertsFilter>;
/**
 * The condition for throttling the notification: `onActionGroupChange`, `onActiveAlert`,  or `onThrottleInterval`
 */
export declare const AttackDiscoveryApiScheduleActionNotifyWhen: z.ZodEnum<{
    onActionGroupChange: "onActionGroupChange";
    onActiveAlert: "onActiveAlert";
    onThrottleInterval: "onThrottleInterval";
}>;
export type AttackDiscoveryApiScheduleActionNotifyWhen = z.infer<typeof AttackDiscoveryApiScheduleActionNotifyWhen>;
export type AttackDiscoveryApiScheduleActionNotifyWhenEnum = typeof AttackDiscoveryApiScheduleActionNotifyWhen.enum;
export declare const AttackDiscoveryApiScheduleActionNotifyWhenEnum: {
    onActionGroupChange: "onActionGroupChange";
    onActiveAlert: "onActiveAlert";
    onThrottleInterval: "onThrottleInterval";
};
/**
 * Defines how often schedule actions are taken. Time interval in seconds, minutes, hours, or days.
 */
export declare const AttackDiscoveryApiScheduleActionThrottle: z.ZodString;
export type AttackDiscoveryApiScheduleActionThrottle = z.infer<typeof AttackDiscoveryApiScheduleActionThrottle>;
/**
 * The action frequency defines when the action runs (for example, only on schedule execution or at specific time intervals).
 */
export declare const AttackDiscoveryApiScheduleActionFrequency: z.ZodObject<{
    summary: z.ZodBoolean;
    notify_when: z.ZodEnum<{
        onActionGroupChange: "onActionGroupChange";
        onActiveAlert: "onActiveAlert";
        onThrottleInterval: "onThrottleInterval";
    }>;
    throttle: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryApiScheduleActionFrequency = z.infer<typeof AttackDiscoveryApiScheduleActionFrequency>;
export declare const AttackDiscoveryApiScheduleGeneralAction: z.ZodObject<{
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
}, z.core.$strip>;
export type AttackDiscoveryApiScheduleGeneralAction = z.infer<typeof AttackDiscoveryApiScheduleGeneralAction>;
export declare const AttackDiscoveryApiScheduleSystemAction: z.ZodObject<{
    action_type_id: z.ZodString;
    id: z.ZodString;
    params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
    uuid: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryApiScheduleSystemAction = z.infer<typeof AttackDiscoveryApiScheduleSystemAction>;
export declare const AttackDiscoveryApiScheduleAction: z.ZodUnion<readonly [z.ZodObject<{
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
}, z.core.$strip>]>;
export type AttackDiscoveryApiScheduleAction = z.infer<typeof AttackDiscoveryApiScheduleAction>;
/**
 * An Attack Discovery schedule execution status
 */
export declare const AttackDiscoveryApiScheduleExecutionStatus: z.ZodEnum<{
    warning: "warning";
    error: "error";
    unknown: "unknown";
    active: "active";
    ok: "ok";
}>;
export type AttackDiscoveryApiScheduleExecutionStatus = z.infer<typeof AttackDiscoveryApiScheduleExecutionStatus>;
export type AttackDiscoveryApiScheduleExecutionStatusEnum = typeof AttackDiscoveryApiScheduleExecutionStatus.enum;
export declare const AttackDiscoveryApiScheduleExecutionStatusEnum: {
    warning: "warning";
    error: "error";
    unknown: "unknown";
    active: "active";
    ok: "ok";
};
/**
 * An Attack Discovery schedule execution information
 */
export declare const AttackDiscoveryApiScheduleExecution: z.ZodObject<{
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
}, z.core.$strip>;
export type AttackDiscoveryApiScheduleExecution = z.infer<typeof AttackDiscoveryApiScheduleExecution>;
/**
 * An Attack Discovery schedule
 */
export declare const AttackDiscoveryApiSchedule: z.ZodObject<{
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
export type AttackDiscoveryApiSchedule = z.infer<typeof AttackDiscoveryApiSchedule>;
/**
 * An Attack Discovery schedule create properties
 */
export declare const AttackDiscoveryApiScheduleCreateProps: z.ZodObject<{
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
export type AttackDiscoveryApiScheduleCreateProps = z.infer<typeof AttackDiscoveryApiScheduleCreateProps>;
/**
 * An Attack Discovery schedule update properties
 */
export declare const AttackDiscoveryApiScheduleUpdateProps: z.ZodObject<{
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
export type AttackDiscoveryApiScheduleUpdateProps = z.infer<typeof AttackDiscoveryApiScheduleUpdateProps>;
