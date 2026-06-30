import { z } from '@kbn/zod/v4';
export declare const ExecuteConnectorRequestQuery: z.ZodObject<{
    content_references_disabled: z.ZodDefault<z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>>;
}, z.core.$strip>;
export type ExecuteConnectorRequestQuery = z.infer<typeof ExecuteConnectorRequestQuery>;
export type ExecuteConnectorRequestQueryInput = z.input<typeof ExecuteConnectorRequestQuery>;
export declare const ExecuteConnectorRequestParams: z.ZodObject<{
    connectorId: z.ZodString;
}, z.core.$strip>;
export type ExecuteConnectorRequestParams = z.infer<typeof ExecuteConnectorRequestParams>;
export type ExecuteConnectorRequestParamsInput = z.input<typeof ExecuteConnectorRequestParams>;
export declare const ExecuteConnectorRequestBody: z.ZodObject<{
    conversationId: z.ZodOptional<z.ZodString>;
    message: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
    subAction: z.ZodEnum<{
        invokeAI: "invokeAI";
        invokeStream: "invokeStream";
    }>;
    actionTypeId: z.ZodString;
    alertsIndexPattern: z.ZodOptional<z.ZodString>;
    allow: z.ZodOptional<z.ZodArray<z.ZodString>>;
    allowReplacement: z.ZodOptional<z.ZodArray<z.ZodString>>;
    replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
    size: z.ZodOptional<z.ZodNumber>;
    langSmithProject: z.ZodOptional<z.ZodString>;
    langSmithApiKey: z.ZodOptional<z.ZodString>;
    screenContext: z.ZodOptional<z.ZodObject<{
        timeZone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    promptIds: z.ZodOptional<z.ZodObject<{
        promptId: z.ZodString;
        promptGroupId: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ExecuteConnectorRequestBody = z.infer<typeof ExecuteConnectorRequestBody>;
export type ExecuteConnectorRequestBodyInput = z.input<typeof ExecuteConnectorRequestBody>;
export declare const ExecuteConnectorResponse: z.ZodObject<{
    data: z.ZodString;
    connector_id: z.ZodString;
    status: z.ZodString;
    trace_data: z.ZodOptional<z.ZodObject<{
        transactionId: z.ZodOptional<z.ZodString>;
        traceId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ExecuteConnectorResponse = z.infer<typeof ExecuteConnectorResponse>;
