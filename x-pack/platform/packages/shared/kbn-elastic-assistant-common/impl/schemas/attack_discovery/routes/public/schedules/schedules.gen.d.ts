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
export declare const AttackDiscoveryScheduleParams: z.ZodObject<{
    alertsIndexPattern: z.ZodString;
    apiConfig: z.ZodObject<{
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
    combinedFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    size: z.ZodNumber;
    start: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryScheduleParams = z.infer<typeof AttackDiscoveryScheduleParams>;
export declare const IntervalSchedule: z.ZodObject<{
    interval: z.ZodString;
}, z.core.$strip>;
export type IntervalSchedule = z.infer<typeof IntervalSchedule>;
/**
 * Groups actions by use cases. Use `default` for alert notifications.
 */
export declare const AttackDiscoveryScheduleActionGroup: z.ZodString;
export type AttackDiscoveryScheduleActionGroup = z.infer<typeof AttackDiscoveryScheduleActionGroup>;
/**
 * The connector ID.
 */
export declare const AttackDiscoveryScheduleActionId: z.ZodString;
export type AttackDiscoveryScheduleActionId = z.infer<typeof AttackDiscoveryScheduleActionId>;
/**
 * Object containing the allowed connector fields, which varies according to the connector type.
 */
export declare const AttackDiscoveryScheduleActionParams: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
export type AttackDiscoveryScheduleActionParams = z.infer<typeof AttackDiscoveryScheduleActionParams>;
export declare const AttackDiscoveryScheduleActionAlertsFilter: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
export type AttackDiscoveryScheduleActionAlertsFilter = z.infer<typeof AttackDiscoveryScheduleActionAlertsFilter>;
/**
 * The condition for throttling the notification: `onActionGroupChange`, `onActiveAlert`,  or `onThrottleInterval`
 */
export declare const AttackDiscoveryScheduleActionNotifyWhen: z.ZodEnum<{
    onActionGroupChange: "onActionGroupChange";
    onActiveAlert: "onActiveAlert";
    onThrottleInterval: "onThrottleInterval";
}>;
export type AttackDiscoveryScheduleActionNotifyWhen = z.infer<typeof AttackDiscoveryScheduleActionNotifyWhen>;
export type AttackDiscoveryScheduleActionNotifyWhenEnum = typeof AttackDiscoveryScheduleActionNotifyWhen.enum;
export declare const AttackDiscoveryScheduleActionNotifyWhenEnum: {
    onActionGroupChange: "onActionGroupChange";
    onActiveAlert: "onActiveAlert";
    onThrottleInterval: "onThrottleInterval";
};
/**
 * Defines how often schedule actions are taken. Time interval in seconds, minutes, hours, or days.
 */
export declare const AttackDiscoveryScheduleActionThrottle: z.ZodString;
export type AttackDiscoveryScheduleActionThrottle = z.infer<typeof AttackDiscoveryScheduleActionThrottle>;
/**
 * The action frequency defines when the action runs (for example, only on schedule execution or at specific time intervals).
 */
export declare const AttackDiscoveryScheduleActionFrequency: z.ZodObject<{
    summary: z.ZodBoolean;
    notifyWhen: z.ZodEnum<{
        onActionGroupChange: "onActionGroupChange";
        onActiveAlert: "onActiveAlert";
        onThrottleInterval: "onThrottleInterval";
    }>;
    throttle: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryScheduleActionFrequency = z.infer<typeof AttackDiscoveryScheduleActionFrequency>;
export declare const AttackDiscoveryScheduleGeneralAction: z.ZodObject<{
    actionTypeId: z.ZodString;
    group: z.ZodString;
    id: z.ZodString;
    params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
    uuid: z.ZodOptional<z.ZodString>;
    alertsFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    frequency: z.ZodOptional<z.ZodObject<{
        summary: z.ZodBoolean;
        notifyWhen: z.ZodEnum<{
            onActionGroupChange: "onActionGroupChange";
            onActiveAlert: "onActiveAlert";
            onThrottleInterval: "onThrottleInterval";
        }>;
        throttle: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AttackDiscoveryScheduleGeneralAction = z.infer<typeof AttackDiscoveryScheduleGeneralAction>;
export declare const AttackDiscoveryScheduleSystemAction: z.ZodObject<{
    actionTypeId: z.ZodString;
    id: z.ZodString;
    params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
    uuid: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AttackDiscoveryScheduleSystemAction = z.infer<typeof AttackDiscoveryScheduleSystemAction>;
export declare const AttackDiscoveryScheduleAction: z.ZodUnion<readonly [z.ZodObject<{
    actionTypeId: z.ZodString;
    group: z.ZodString;
    id: z.ZodString;
    params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
    uuid: z.ZodOptional<z.ZodString>;
    alertsFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
    frequency: z.ZodOptional<z.ZodObject<{
        summary: z.ZodBoolean;
        notifyWhen: z.ZodEnum<{
            onActionGroupChange: "onActionGroupChange";
            onActiveAlert: "onActiveAlert";
            onThrottleInterval: "onThrottleInterval";
        }>;
        throttle: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    actionTypeId: z.ZodString;
    id: z.ZodString;
    params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
    uuid: z.ZodOptional<z.ZodString>;
}, z.core.$strip>]>;
export type AttackDiscoveryScheduleAction = z.infer<typeof AttackDiscoveryScheduleAction>;
/**
 * An Attack Discovery schedule execution status
 */
export declare const AttackDiscoveryScheduleExecutionStatus: z.ZodEnum<{
    warning: "warning";
    error: "error";
    unknown: "unknown";
    active: "active";
    ok: "ok";
}>;
export type AttackDiscoveryScheduleExecutionStatus = z.infer<typeof AttackDiscoveryScheduleExecutionStatus>;
export type AttackDiscoveryScheduleExecutionStatusEnum = typeof AttackDiscoveryScheduleExecutionStatus.enum;
export declare const AttackDiscoveryScheduleExecutionStatusEnum: {
    warning: "warning";
    error: "error";
    unknown: "unknown";
    active: "active";
    ok: "ok";
};
/**
 * An Attack Discovery schedule execution information
 */
export declare const AttackDiscoveryScheduleExecution: z.ZodObject<{
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
export type AttackDiscoveryScheduleExecution = z.infer<typeof AttackDiscoveryScheduleExecution>;
/**
 * An Attack Discovery schedule
 */
export declare const AttackDiscoverySchedule: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    createdBy: z.ZodString;
    updatedBy: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    enabled: z.ZodBoolean;
    params: z.ZodObject<{
        alertsIndexPattern: z.ZodString;
        apiConfig: z.ZodObject<{
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
        combinedFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        actionTypeId: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alertsFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notifyWhen: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        actionTypeId: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>;
    lastExecution: z.ZodOptional<z.ZodObject<{
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
export type AttackDiscoverySchedule = z.infer<typeof AttackDiscoverySchedule>;
/**
 * An Attack Discovery schedule create properties
 */
export declare const AttackDiscoveryScheduleCreateProps: z.ZodObject<{
    name: z.ZodString;
    enabled: z.ZodOptional<z.ZodBoolean>;
    params: z.ZodObject<{
        alertsIndexPattern: z.ZodString;
        apiConfig: z.ZodObject<{
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
        combinedFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        actionTypeId: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alertsFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notifyWhen: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        actionTypeId: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>>;
}, z.core.$strip>;
export type AttackDiscoveryScheduleCreateProps = z.infer<typeof AttackDiscoveryScheduleCreateProps>;
/**
 * An Attack Discovery schedule update properties
 */
export declare const AttackDiscoveryScheduleUpdateProps: z.ZodObject<{
    name: z.ZodString;
    params: z.ZodObject<{
        alertsIndexPattern: z.ZodString;
        apiConfig: z.ZodObject<{
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
        combinedFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        size: z.ZodNumber;
        start: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    schedule: z.ZodObject<{
        interval: z.ZodString;
    }, z.core.$strip>;
    actions: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        actionTypeId: z.ZodString;
        group: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
        alertsFilter: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        frequency: z.ZodOptional<z.ZodObject<{
            summary: z.ZodBoolean;
            notifyWhen: z.ZodEnum<{
                onActionGroupChange: "onActionGroupChange";
                onActiveAlert: "onActiveAlert";
                onThrottleInterval: "onThrottleInterval";
            }>;
            throttle: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>, z.ZodObject<{
        actionTypeId: z.ZodString;
        id: z.ZodString;
        params: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
        uuid: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>]>>;
}, z.core.$strip>;
export type AttackDiscoveryScheduleUpdateProps = z.infer<typeof AttackDiscoveryScheduleUpdateProps>;
