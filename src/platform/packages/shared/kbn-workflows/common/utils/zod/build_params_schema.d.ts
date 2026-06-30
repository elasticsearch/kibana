import { z } from '@kbn/zod/v4';
interface BuildParamsSchemaOptions {
    /** The full request schema containing body, path, query, headers */
    requestSchema: z.ZodType;
    /** Additional schemas to merge into each variant (e.g., fetcher config) */
    additionalSchemas?: Record<string, z.ZodType>;
}
/**
 * Builds a paramsSchema from a request schema, properly handling union bodies.
 *
 * For schemas without union bodies: creates z.object({ ...body, ...path, ...query, ...additional })
 * For schemas with union bodies: creates z.union([
 *   z.object({ ...unionOption1, ...path, ...query, ...additional }),
 *   z.object({ ...unionOption2, ...path, ...query, ...additional }),
 *   ...
 * ])
 *
 * This preserves discriminated union semantics (e.g., alert vs user comment types)
 * instead of flattening all properties into a single object.
 */
export declare function buildParamsSchema({ requestSchema, additionalSchemas, }: BuildParamsSchemaOptions): z.ZodType;
export {};
