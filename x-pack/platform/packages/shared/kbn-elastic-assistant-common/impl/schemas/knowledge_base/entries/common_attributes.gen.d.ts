import { z } from '@kbn/zod/v4';
/**
 * Array of objects defining the input schema, allowing the LLM to extract structured data to be used in retrieval.
 */
export declare const InputSchema: z.ZodArray<z.ZodObject<{
    fieldName: z.ZodString;
    fieldType: z.ZodString;
    description: z.ZodString;
}, z.core.$strip>>;
export type InputSchema = z.infer<typeof InputSchema>;
export declare const KnowledgeBaseEntryErrorSchema: z.ZodObject<{
    statusCode: z.ZodNumber;
    error: z.ZodString;
    message: z.ZodString;
}, z.core.$strict>;
export type KnowledgeBaseEntryErrorSchema = z.infer<typeof KnowledgeBaseEntryErrorSchema>;
/**
 * Knowledge Base resource name for grouping entries, e.g. 'security_labs', 'user', etc.
 */
export declare const KnowledgeBaseResource: z.ZodEnum<{
    user: "user";
    security_labs: "security_labs";
    defend_insights: "defend_insights";
}>;
export type KnowledgeBaseResource = z.infer<typeof KnowledgeBaseResource>;
export type KnowledgeBaseResourceEnum = typeof KnowledgeBaseResource.enum;
export declare const KnowledgeBaseResourceEnum: {
    user: "user";
    security_labs: "security_labs";
    defend_insights: "defend_insights";
};
/**
 * Metadata about a Knowledge Base Entry.
 */
export declare const Metadata: z.ZodObject<{
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    required: z.ZodBoolean;
}, z.core.$strip>;
export type Metadata = z.infer<typeof Metadata>;
/**
 * Object containing Knowledge Base Entry text embeddings and modelId used to create the embeddings.
 */
export declare const Vector: z.ZodObject<{
    modelId: z.ZodString;
    tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
}, z.core.$strip>;
export type Vector = z.infer<typeof Vector>;
export declare const BaseRequiredFields: z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>;
export type BaseRequiredFields = z.infer<typeof BaseRequiredFields>;
export declare const BaseDefaultableFields: z.ZodObject<{
    namespace: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type BaseDefaultableFields = z.infer<typeof BaseDefaultableFields>;
export declare const BaseCreateProps: z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodOptional<z.ZodString>;
    global: z.ZodOptional<z.ZodBoolean>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type BaseCreateProps = z.infer<typeof BaseCreateProps>;
export declare const BaseUpdateProps: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    id: z.ZodString;
}, z.core.$strip>;
export type BaseUpdateProps = z.infer<typeof BaseUpdateProps>;
export declare const BaseResponseProps: z.ZodObject<{
    name: z.ZodString;
    namespace: z.ZodNonOptional<z.ZodOptional<z.ZodString>>;
    global: z.ZodNonOptional<z.ZodOptional<z.ZodBoolean>>;
    users: z.ZodNonOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
}, z.core.$strip>;
export type BaseResponseProps = z.infer<typeof BaseResponseProps>;
export declare const ResponseFields: z.ZodObject<{
    id: z.ZodString;
    createdAt: z.ZodString;
    createdBy: z.ZodString;
    updatedAt: z.ZodString;
    updatedBy: z.ZodString;
}, z.core.$strip>;
export type ResponseFields = z.infer<typeof ResponseFields>;
export declare const DeleteResponseFields: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DeleteResponseFields = z.infer<typeof DeleteResponseFields>;
export declare const SharedResponseProps: z.ZodObject<{
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
}, z.core.$strip>;
export type SharedResponseProps = z.infer<typeof SharedResponseProps>;
export declare const DocumentEntryType: z.ZodLiteral<"document">;
export type DocumentEntryType = z.infer<typeof DocumentEntryType>;
export declare const DocumentEntryRequiredFields: z.ZodObject<{
    type: z.ZodLiteral<"document">;
    kbResource: z.ZodEnum<{
        user: "user";
        security_labs: "security_labs";
        defend_insights: "defend_insights";
    }>;
    source: z.ZodString;
    text: z.ZodString;
}, z.core.$strip>;
export type DocumentEntryRequiredFields = z.infer<typeof DocumentEntryRequiredFields>;
export declare const DocumentEntryOptionalFields: z.ZodObject<{
    required: z.ZodOptional<z.ZodBoolean>;
    vector: z.ZodOptional<z.ZodObject<{
        modelId: z.ZodString;
        tokens: z.ZodObject<{}, z.core.$catchall<z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type DocumentEntryOptionalFields = z.infer<typeof DocumentEntryOptionalFields>;
export declare const DocumentEntryCreateFields: z.ZodObject<{
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
}, z.core.$strip>;
export type DocumentEntryCreateFields = z.infer<typeof DocumentEntryCreateFields>;
export declare const DocumentEntryUpdateFields: z.ZodObject<{
    id: z.ZodString;
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
}, z.core.$strip>;
export type DocumentEntryUpdateFields = z.infer<typeof DocumentEntryUpdateFields>;
export declare const DocumentEntryResponseFields: z.ZodObject<{
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
}, z.core.$strip>;
export type DocumentEntryResponseFields = z.infer<typeof DocumentEntryResponseFields>;
export declare const DocumentEntry: z.ZodObject<{
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
}, z.core.$strip>;
export type DocumentEntry = z.infer<typeof DocumentEntry>;
export declare const IndexEntryType: z.ZodLiteral<"index">;
export type IndexEntryType = z.infer<typeof IndexEntryType>;
export declare const IndexEntryRequiredFields: z.ZodObject<{
    type: z.ZodLiteral<"index">;
    index: z.ZodString;
    field: z.ZodString;
    description: z.ZodString;
    queryDescription: z.ZodString;
}, z.core.$strip>;
export type IndexEntryRequiredFields = z.infer<typeof IndexEntryRequiredFields>;
export declare const IndexEntryOptionalFields: z.ZodObject<{
    inputSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fieldName: z.ZodString;
        fieldType: z.ZodString;
        description: z.ZodString;
    }, z.core.$strip>>>;
    outputFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type IndexEntryOptionalFields = z.infer<typeof IndexEntryOptionalFields>;
export declare const IndexEntryCreateFields: z.ZodObject<{
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
}, z.core.$strip>;
export type IndexEntryCreateFields = z.infer<typeof IndexEntryCreateFields>;
export declare const IndexEntryUpdateFields: z.ZodObject<{
    id: z.ZodString;
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
}, z.core.$strip>;
export type IndexEntryUpdateFields = z.infer<typeof IndexEntryUpdateFields>;
export declare const IndexEntryResponseFields: z.ZodObject<{
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
}, z.core.$strip>;
export type IndexEntryResponseFields = z.infer<typeof IndexEntryResponseFields>;
export declare const IndexEntry: z.ZodObject<{
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
}, z.core.$strip>;
export type IndexEntry = z.infer<typeof IndexEntry>;
export declare const KnowledgeBaseEntryCreateProps: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type KnowledgeBaseEntryCreateProps = z.infer<typeof KnowledgeBaseEntryCreateProps>;
export declare const KnowledgeBaseEntryUpdateProps: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
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
    id: z.ZodString;
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
export type KnowledgeBaseEntryUpdateProps = z.infer<typeof KnowledgeBaseEntryUpdateProps>;
export declare const KnowledgeBaseEntryUpdateRouteProps: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type KnowledgeBaseEntryUpdateRouteProps = z.infer<typeof KnowledgeBaseEntryUpdateRouteProps>;
export declare const KnowledgeBaseEntryResponse: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
export type KnowledgeBaseEntryResponse = z.infer<typeof KnowledgeBaseEntryResponse>;
export declare const KnowledgeBaseEntryDeleteResponse: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type KnowledgeBaseEntryDeleteResponse = z.infer<typeof KnowledgeBaseEntryDeleteResponse>;
