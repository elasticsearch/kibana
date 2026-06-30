import { z } from '@kbn/zod/v4';
/**
 * Field by which to sort the prompts.
 */
export declare const FindPromptsSortField: z.ZodEnum<{
    name: "name";
    created_at: "created_at";
    updated_at: "updated_at";
    is_default: "is_default";
}>;
export type FindPromptsSortField = z.infer<typeof FindPromptsSortField>;
export type FindPromptsSortFieldEnum = typeof FindPromptsSortField.enum;
export declare const FindPromptsSortFieldEnum: {
    name: "name";
    created_at: "created_at";
    updated_at: "updated_at";
    is_default: "is_default";
};
export declare const FindPromptsRequestQuery: z.ZodObject<{
    fields: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    filter: z.ZodOptional<z.ZodString>;
    sort_field: z.ZodOptional<z.ZodEnum<{
        name: "name";
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
export type FindPromptsRequestQuery = z.infer<typeof FindPromptsRequestQuery>;
export type FindPromptsRequestQueryInput = z.input<typeof FindPromptsRequestQuery>;
export declare const FindPromptsResponse: z.ZodObject<{
    page: z.ZodNumber;
    perPage: z.ZodNumber;
    total: z.ZodNumber;
    data: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        promptType: z.ZodEnum<{
            system: "system";
            quick: "quick";
        }>;
        content: z.ZodString;
        categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
        color: z.ZodOptional<z.ZodString>;
        isNewConversationDefault: z.ZodOptional<z.ZodBoolean>;
        isDefault: z.ZodOptional<z.ZodBoolean>;
        consumer: z.ZodOptional<z.ZodString>;
        updatedAt: z.ZodOptional<z.ZodString>;
        updatedBy: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodOptional<z.ZodString>;
        users: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        namespace: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FindPromptsResponse = z.infer<typeof FindPromptsResponse>;
