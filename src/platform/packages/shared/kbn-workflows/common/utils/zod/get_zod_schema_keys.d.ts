import type { ZodType } from '@kbn/zod/v4';
/**
 * Returns the keys of a flattened zod schema.
 * @param schemaParam - The zod schema to get the keys of.
 * @returns The keys of the zod schema.
 */
export declare const getZodSchemaKeys: (schemaParam: ZodType) => string[];
