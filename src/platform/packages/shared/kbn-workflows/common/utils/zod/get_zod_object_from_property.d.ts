import { z } from '@kbn/zod/v4';
export declare function getZodObjectFromProperty(schema: z.ZodObject | z.ZodOptional | z.ZodNever, property: string): z.ZodObject | null;
