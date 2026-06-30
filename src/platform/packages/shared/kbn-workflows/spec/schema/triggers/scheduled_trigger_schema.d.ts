import { z } from '@kbn/zod/v4';
export declare const SCHEDULED_INTERVAL_PATTERN: RegExp;
export declare const SCHEDULED_INTERVAL_ERROR = "Scheduled interval must be at least 1 minute. Use format like \"1m\", \"90s\", \"2h\", \"1d\"";
export declare const ScheduledTriggerSchema: z.ZodObject<{
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
}, z.core.$strip>;
