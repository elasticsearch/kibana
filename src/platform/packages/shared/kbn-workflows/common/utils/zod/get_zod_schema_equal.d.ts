import { z } from '@kbn/zod/v4';
/**
 * Helper to compare two Zod schemas via conversion to JSON Schema. To be used in tests.
 * @param a - The first Zod schema.
 * @param b - The second Zod schema.
 */
export declare function expectZodSchemaEqual(a: z.ZodType, b: z.ZodType): void;
