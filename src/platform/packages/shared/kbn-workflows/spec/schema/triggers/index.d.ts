import { z } from '@kbn/zod/v4';
export { AlertRuleTriggerSchema } from './alert_trigger_schema';
export { ManualTriggerSchema } from './manual_trigger_schema';
export { ScheduledTriggerSchema, SCHEDULED_INTERVAL_ERROR, SCHEDULED_INTERVAL_PATTERN, } from './scheduled_trigger_schema';
export declare const TriggerSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"alert">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"scheduled">;
    with: z.ZodUnion<readonly [z.ZodObject<{
        every: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        rrule: z.ZodObject<{
            freq: z.ZodEnum<{
                DAILY: "DAILY";
                WEEKLY: "WEEKLY";
                MONTHLY: "MONTHLY";
            }>;
            interval: z.ZodNumber;
            tzid: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
                [x: string]: string;
            }>>>;
            dtstart: z.ZodOptional<z.ZodString>;
            byhour: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            byminute: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
            byweekday: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                MO: "MO";
                TU: "TU";
                WE: "WE";
                TH: "TH";
                FR: "FR";
                SA: "SA";
                SU: "SU";
            }>>>;
            bymonthday: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        }, z.core.$strip>;
    }, z.core.$strip>]>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"manual">;
    inputs: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        type: z.ZodOptional<z.ZodLiteral<"object">>;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        $ref: z.ZodOptional<z.ZodString> | z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
            [x: string]: string;
        }>, z.ZodString]>>;
        properties: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
        additionalProperties: z.ZodOptional<z.ZodBoolean>;
        required: z.ZodOptional<z.ZodArray<z.ZodString>>;
        definitions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
        $defs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<import("../common/json_model_shape_schema").JsonSchema, unknown, z.core.$ZodTypeInternals<import("../common/json_model_shape_schema").JsonSchema, unknown>>>>;
    }, z.core.$strip>, z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"string">;
        default: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"number">;
        default: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"boolean">;
        default: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"choice">;
        default: z.ZodOptional<z.ZodString>;
        options: z.ZodArray<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        type: z.ZodLiteral<"array">;
        minItems: z.ZodOptional<z.ZodNumber>;
        maxItems: z.ZodOptional<z.ZodNumber>;
        default: z.ZodOptional<z.ZodUnion<readonly [z.ZodArray<z.ZodString>, z.ZodArray<z.ZodNumber>, z.ZodArray<z.ZodBoolean>]>>;
    }, z.core.$strip>]>>]>>;
}, z.core.$strip>], "type">;
export type Trigger = z.infer<typeof TriggerSchema>;
/** Allowed values for `on.workflowEvents` on custom (event-driven) triggers. */
declare const WORKFLOW_EVENTS_VALUES: readonly ["ignore", "allow-all", "avoid-loop"];
export type WorkflowEventsValue = (typeof WORKFLOW_EVENTS_VALUES)[number];
export declare const WORKFLOW_EVENTS_VALUES_SET: Set<string>;
export declare const WorkflowEventsSchema: z.ZodEnum<{
    ignore: "ignore";
    "allow-all": "allow-all";
    "avoid-loop": "avoid-loop";
}>;
/**
 * Returns a trigger schema that includes built-in types plus optional registered trigger ids.
 * Used by the YAML editor so custom trigger types (e.g. example.custom_trigger) pass validation.
 * Custom triggers allow an `on.condition` clause for KQL filtering.
 */
export declare function getTriggerSchema(customTriggerIds?: string[]): z.ZodType;
export declare const TriggerTypes: ("alert" | "manual" | "scheduled")[];
export type TriggerType = (typeof TriggerTypes)[number];
