import { z } from '@kbn/zod/v4';
export declare const PostEvaluateBody: z.ZodObject<{
    graphs: z.ZodArray<z.ZodString>;
    datasetName: z.ZodString;
    evaluatorConnectorId: z.ZodOptional<z.ZodString>;
    connectorIds: z.ZodArray<z.ZodString>;
    runName: z.ZodOptional<z.ZodString>;
    alertsIndexPattern: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    langSmithApiKey: z.ZodOptional<z.ZodString>;
    langSmithProject: z.ZodOptional<z.ZodString>;
    replacements: z.ZodDefault<z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>>;
    screenContext: z.ZodOptional<z.ZodObject<{
        timeZone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    size: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strip>;
export type PostEvaluateBody = z.infer<typeof PostEvaluateBody>;
export declare const PostEvaluateRequestBody: z.ZodObject<{
    graphs: z.ZodArray<z.ZodString>;
    datasetName: z.ZodString;
    evaluatorConnectorId: z.ZodOptional<z.ZodString>;
    connectorIds: z.ZodArray<z.ZodString>;
    runName: z.ZodOptional<z.ZodString>;
    alertsIndexPattern: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    langSmithApiKey: z.ZodOptional<z.ZodString>;
    langSmithProject: z.ZodOptional<z.ZodString>;
    replacements: z.ZodDefault<z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>>;
    screenContext: z.ZodOptional<z.ZodObject<{
        timeZone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    size: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, z.core.$strip>;
export type PostEvaluateRequestBody = z.infer<typeof PostEvaluateRequestBody>;
export type PostEvaluateRequestBodyInput = z.input<typeof PostEvaluateRequestBody>;
export declare const PostEvaluateResponse: z.ZodObject<{
    evaluationId: z.ZodString;
    success: z.ZodBoolean;
}, z.core.$strip>;
export type PostEvaluateResponse = z.infer<typeof PostEvaluateResponse>;
