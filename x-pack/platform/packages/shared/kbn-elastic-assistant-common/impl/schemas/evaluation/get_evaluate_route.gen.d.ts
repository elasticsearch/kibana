import { z } from '@kbn/zod/v4';
export declare const GetEvaluateResponse: z.ZodObject<{
    datasets: z.ZodArray<z.ZodString>;
    graphs: z.ZodArray<z.ZodString>;
    results: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        status: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GetEvaluateResponse = z.infer<typeof GetEvaluateResponse>;
