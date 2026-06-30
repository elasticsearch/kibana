import { z } from '@kbn/zod/v4';
export declare const CreateKnowledgeBaseEntryRequestBody: z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"document">;
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    text: z.ZodString;
    required: z.ZodOptional<z.ZodBoolean>;
    vector: z.ZodOptional<z.ZodObject<{
        modelId: z.ZodString;
        tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"index">;
    index: z.ZodString;
    field: z.ZodString;
    description: z.ZodString;
    queryDescription: z.ZodString;
    inputSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        fieldType: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>>;
    outputFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>], "type">;
export type CreateKnowledgeBaseEntryRequestBody = z.infer<typeof CreateKnowledgeBaseEntryRequestBody>;
export type CreateKnowledgeBaseEntryRequestBodyInput = z.input<typeof CreateKnowledgeBaseEntryRequestBody>;
export declare const CreateKnowledgeBaseEntryResponse: z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
    type: z.ZodLiteral<"document">;
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    text: z.ZodString;
    required: z.ZodOptional<z.ZodBoolean>;
    vector: z.ZodOptional<z.ZodObject<{
        modelId: z.ZodString;
        tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
    type: z.ZodLiteral<"index">;
    index: z.ZodString;
    field: z.ZodString;
    description: z.ZodString;
    queryDescription: z.ZodString;
    inputSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        fieldType: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>>;
    outputFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>], "type">;
export type CreateKnowledgeBaseEntryResponse = z.infer<typeof CreateKnowledgeBaseEntryResponse>;
export declare const DeleteKnowledgeBaseEntryRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DeleteKnowledgeBaseEntryRequestParams = z.infer<typeof DeleteKnowledgeBaseEntryRequestParams>;
export type DeleteKnowledgeBaseEntryRequestParamsInput = z.input<typeof DeleteKnowledgeBaseEntryRequestParams>;
export declare const DeleteKnowledgeBaseEntryResponse: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DeleteKnowledgeBaseEntryResponse = z.infer<typeof DeleteKnowledgeBaseEntryResponse>;
export declare const ReadKnowledgeBaseEntryRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type ReadKnowledgeBaseEntryRequestParams = z.infer<typeof ReadKnowledgeBaseEntryRequestParams>;
export type ReadKnowledgeBaseEntryRequestParamsInput = z.input<typeof ReadKnowledgeBaseEntryRequestParams>;
export declare const ReadKnowledgeBaseEntryResponse: z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
    type: z.ZodLiteral<"document">;
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    text: z.ZodString;
    required: z.ZodOptional<z.ZodBoolean>;
    vector: z.ZodOptional<z.ZodObject<{
        modelId: z.ZodString;
        tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
    type: z.ZodLiteral<"index">;
    index: z.ZodString;
    field: z.ZodString;
    description: z.ZodString;
    queryDescription: z.ZodString;
    inputSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        fieldType: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>>;
    outputFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>], "type">;
export type ReadKnowledgeBaseEntryResponse = z.infer<typeof ReadKnowledgeBaseEntryResponse>;
export declare const UpdateKnowledgeBaseEntryRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type UpdateKnowledgeBaseEntryRequestParams = z.infer<typeof UpdateKnowledgeBaseEntryRequestParams>;
export type UpdateKnowledgeBaseEntryRequestParamsInput = z.input<typeof UpdateKnowledgeBaseEntryRequestParams>;
export declare const UpdateKnowledgeBaseEntryRequestBody: z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"document">;
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    text: z.ZodString;
    required: z.ZodOptional<z.ZodBoolean>;
    vector: z.ZodOptional<z.ZodObject<{
        modelId: z.ZodString;
        tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    type: z.ZodLiteral<"index">;
    index: z.ZodString;
    field: z.ZodString;
    description: z.ZodString;
    queryDescription: z.ZodString;
    inputSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        fieldType: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>>;
    outputFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>], "type">;
export type UpdateKnowledgeBaseEntryRequestBody = z.infer<typeof UpdateKnowledgeBaseEntryRequestBody>;
export type UpdateKnowledgeBaseEntryRequestBodyInput = z.input<typeof UpdateKnowledgeBaseEntryRequestBody>;
export declare const UpdateKnowledgeBaseEntryResponse: z.ZodDiscriminatedUnion<[z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
    type: z.ZodLiteral<"document">;
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    text: z.ZodString;
    required: z.ZodOptional<z.ZodBoolean>;
    vector: z.ZodOptional<z.ZodObject<{
        modelId: z.ZodString;
        tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
    type: z.ZodLiteral<"index">;
    index: z.ZodString;
    field: z.ZodString;
    description: z.ZodString;
    queryDescription: z.ZodString;
    inputSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        fieldType: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>>;
    outputFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>], "type">;
export type UpdateKnowledgeBaseEntryResponse = z.infer<typeof UpdateKnowledgeBaseEntryResponse>;
