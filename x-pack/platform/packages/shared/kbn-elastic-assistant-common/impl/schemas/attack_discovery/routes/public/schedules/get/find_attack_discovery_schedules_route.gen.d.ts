import { z } from '@kbn/zod/v4';
export declare const FindAttackDiscoverySchedulesRequestQuery: z.ZodObject<{
    page: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    per_page: z.ZodOptional<z.ZodCoercedNumber<unknown>>;
    sort_field: z.ZodOptional<z.ZodString>;
    sort_direction: z.ZodOptional<z.ZodEnum<{
        desc: "desc";
        asc: "asc";
    }>>;
}, z.core.$strip>;
export type FindAttackDiscoverySchedulesRequestQuery = z.infer<typeof FindAttackDiscoverySchedulesRequestQuery>;
export type FindAttackDiscoverySchedulesRequestQueryInput = z.input<typeof FindAttackDiscoverySchedulesRequestQuery>;
export declare const FindAttackDiscoverySchedulesResponse: z.ZodObject<{
    page: z.ZodNumber;
    per_page: z.ZodNumber;
    total: z.ZodNumber;
    data: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FindAttackDiscoverySchedulesResponse = z.infer<typeof FindAttackDiscoverySchedulesResponse>;
