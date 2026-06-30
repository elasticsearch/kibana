import { z } from '@kbn/zod/v4';
export declare function getZodLooseObjectFromProperty(schema: z.ZodObject | z.ZodOptional | z.ZodNever, property: string): z.ZodObject;
