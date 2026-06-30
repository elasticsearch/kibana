import type { z } from '@kbn/zod/v4';
export type ZodTypeKind = z.core.$ZodTypeDef['type'];
export declare function getZodSchemaType(schema: z.ZodType): ZodTypeKind;
