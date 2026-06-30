import { z } from '@kbn/zod/v4';
export declare function getZodTypeName(schema: z.ZodType): string;
export declare function getArrayDescription(arraySchema: z.ZodArray, depth?: number): string;
export declare function getUnionDescription(unionSchema: z.ZodUnion): string;
export declare function getEnumDescription(schema: z.ZodEnum): string;
export declare function getLiteralDescription(schema: z.ZodLiteral): string;
