import { z } from '@kbn/zod/v4';
export declare const AlertRuleTriggerSchema: z.ZodObject<{
    type: z.ZodLiteral<"alert">;
}, z.core.$strip>;
export type AlertRuleTrigger = z.infer<typeof AlertRuleTriggerSchema>;
export declare const AlertSchema: z.ZodObject<{
    _id: z.ZodString;
    _index: z.ZodString;
    kibana: z.ZodObject<{
        alert: z.ZodUnknown;
    }, z.core.$strip>;
    '@timestamp': z.ZodString;
}, z.core.$strip>;
export declare const RuleSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    tags: z.ZodArray<z.ZodString>;
    consumer: z.ZodString;
    producer: z.ZodString;
    ruleTypeId: z.ZodString;
}, z.core.$strip>;
/**
 * Full event schema (used for runtime validation of alert-triggered workflows).
 * For autocomplete, use getEventSchemaForTriggers() to get a trigger-aware schema.
 */
export declare const AlertEventSchema: z.ZodObject<{
    alerts: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        _id: z.ZodString;
        _index: z.ZodString;
        kibana: z.ZodObject<{
            alert: z.ZodUnknown;
        }, z.core.$strip>;
        '@timestamp': z.ZodString;
    }, z.core.$strip>, z.ZodUnknown]>>;
    rule: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        tags: z.ZodArray<z.ZodString>;
        consumer: z.ZodString;
        producer: z.ZodString;
        ruleTypeId: z.ZodString;
    }, z.core.$strip>;
    params: z.ZodUnknown;
    spaceId: z.ZodString;
}, z.core.$strip>;
export type AlertEvent = z.infer<typeof AlertEventSchema>;
export declare const isAlertTrigger: (trigger: {
    type?: string;
}) => trigger is AlertRuleTrigger;
