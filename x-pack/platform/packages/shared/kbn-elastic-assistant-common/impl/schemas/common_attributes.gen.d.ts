import { z } from '@kbn/zod/v4';
/**
 * A string that does not contain only whitespace characters.
 */
export declare const NonEmptyString: z.ZodString;
export type NonEmptyString = z.infer<typeof NonEmptyString>;
/**
 * A string that represents a timestamp in ISO 8601 format and does not contain only whitespace characters.
 */
export declare const NonEmptyTimestamp: z.ZodString;
export type NonEmptyTimestamp = z.infer<typeof NonEmptyTimestamp>;
/**
 * A universally unique identifier.
 */
export declare const UUID: z.ZodString;
export type UUID = z.infer<typeof UUID>;
/**
 * Could be any string, not necessarily a UUID.
 */
export declare const User: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type User = z.infer<typeof User>;
/**
 * The order in which results are sorted.
 */
export declare const SortOrder: z.ZodEnum<{
    desc: "desc";
    asc: "asc";
}>;
export type SortOrder = z.infer<typeof SortOrder>;
export type SortOrderEnum = typeof SortOrder.enum;
export declare const SortOrderEnum: {
    desc: "desc";
    asc: "asc";
};
/**
 * User screen context.
 */
export declare const ScreenContext: z.ZodObject<{
    timeZone: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ScreenContext = z.infer<typeof ScreenContext>;
export declare const BulkCrudActionSummary: z.ZodObject<{
    failed: z.ZodNumber;
    skipped: z.ZodNumber;
    succeeded: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export type BulkCrudActionSummary = z.infer<typeof BulkCrudActionSummary>;
export declare const BulkActionBase: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type BulkActionBase = z.infer<typeof BulkActionBase>;
/**
 * IDs for a specific prompt within a group of prompts.
 */
export declare const PromptIds: z.ZodObject<{
    promptId: z.ZodString;
    promptGroupId: z.ZodString;
}, z.core.$strip>;
export type PromptIds = z.infer<typeof PromptIds>;
