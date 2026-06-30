import { z } from '@kbn/zod/v4';
/**
 * Fields available for sorting Knowledge Base Entries.
 */
export declare const FindKnowledgeBaseEntriesSortField: z.ZodEnum<{
    title: "title";
    created_at: "created_at";
    updated_at: "updated_at";
    is_default: "is_default";
}>;
export type FindKnowledgeBaseEntriesSortField = z.infer<typeof FindKnowledgeBaseEntriesSortField>;
export type FindKnowledgeBaseEntriesSortFieldEnum = typeof FindKnowledgeBaseEntriesSortField.enum;
export declare const FindKnowledgeBaseEntriesSortFieldEnum: {
    title: "title";
    created_at: "created_at";
    updated_at: "updated_at";
    is_default: "is_default";
};
export declare const FindKnowledgeBaseEntriesRequestQuery: z.ZodObject<{
    fields: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    filter: z.ZodOptional<z.ZodString>;
    sort_field: z.ZodOptional<z.ZodEnum<{
        title: "title";
        created_at: "created_at";
        updated_at: "updated_at";
        is_default: "is_default";
    }>>;
    sort_order: z.ZodOptional<z.ZodEnum<{
        desc: "desc";
        asc: "asc";
    }>>;
    page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    per_page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
}, z.core.$strip>;
export type FindKnowledgeBaseEntriesRequestQuery = z.infer<typeof FindKnowledgeBaseEntriesRequestQuery>;
export type FindKnowledgeBaseEntriesRequestQueryInput = z.input<typeof FindKnowledgeBaseEntriesRequestQuery>;
export declare const FindKnowledgeBaseEntriesResponse: z.ZodObject<{
    page: z.ZodNumber;
    perPage: z.ZodNumber;
    total: z.ZodNumber;
    data: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "type">>;
}, z.core.$strip>;
export type FindKnowledgeBaseEntriesResponse = z.infer<typeof FindKnowledgeBaseEntriesResponse>;
