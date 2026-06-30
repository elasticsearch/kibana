import { z } from '@kbn/zod/v4';
/**
 * Infer a zod schema from an object.
 * @param obj - The object to infer the schema from.
 * @param isConst - If true, the schema will use a literal instead of the inferred type.
 * @returns The inferred zod schema.
 */
export declare function inferZodType(obj: unknown, { isConst }?: {
    isConst?: boolean;
}): z.ZodType;
