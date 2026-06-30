import { z } from '@kbn/zod/v4';
/**
 * Reason why a prompt was skipped during the bulk action.
 */
export declare const PromptsBulkActionSkipReason: z.ZodLiteral<"PROMPT_FIELD_NOT_MODIFIED">;
export type PromptsBulkActionSkipReason = z.infer<typeof PromptsBulkActionSkipReason>;
export declare const PromptsBulkActionSkipResult: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    skip_reason: z.ZodLiteral<"PROMPT_FIELD_NOT_MODIFIED">;
}, z.core.$strip>;
export type PromptsBulkActionSkipResult = z.infer<typeof PromptsBulkActionSkipResult>;
export declare const PromptDetailsInError: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PromptDetailsInError = z.infer<typeof PromptDetailsInError>;
/**
 * Type of the prompt (either system or quick).
 */
export declare const PromptType: z.ZodEnum<{
    system: "system";
    quick: "quick";
}>;
export type PromptType = z.infer<typeof PromptType>;
export type PromptTypeEnum = typeof PromptType.enum;
export declare const PromptTypeEnum: {
    system: "system";
    quick: "quick";
};
export declare const NormalizedPromptError: z.ZodObject<{
    message: z.ZodString;
    status_code: z.ZodNumber;
    err_code: z.ZodOptional<z.ZodString>;
    prompts: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type NormalizedPromptError = z.infer<typeof NormalizedPromptError>;
export declare const PromptResponse: z.ZodObject<{
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
}, z.core.$strip>;
export type PromptResponse = z.infer<typeof PromptResponse>;
export declare const PromptsBulkCrudActionResults: z.ZodObject<{
    updated: z.ZodArray<z.ZodObject<{
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
    created: z.ZodArray<z.ZodObject<{
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
    deleted: z.ZodArray<z.ZodString>;
    skipped: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        skip_reason: z.ZodLiteral<"PROMPT_FIELD_NOT_MODIFIED">;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PromptsBulkCrudActionResults = z.infer<typeof PromptsBulkCrudActionResults>;
export declare const PromptsBulkCrudActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    status_code: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    prompts_count: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodObject<{
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
            created: z.ZodArray<z.ZodObject<{
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
            deleted: z.ZodArray<z.ZodString>;
            skipped: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"PROMPT_FIELD_NOT_MODIFIED">;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        summary: z.ZodObject<{
            failed: z.ZodNumber;
            skipped: z.ZodNumber;
            succeeded: z.ZodNumber;
            total: z.ZodNumber;
        }, z.core.$strip>;
        errors: z.ZodOptional<z.ZodArray<z.ZodObject<{
            message: z.ZodString;
            status_code: z.ZodNumber;
            err_code: z.ZodOptional<z.ZodString>;
            prompts: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PromptsBulkCrudActionResponse = z.infer<typeof PromptsBulkCrudActionResponse>;
export declare const PromptCreateProps: z.ZodObject<{
    name: z.ZodString;
    promptType: z.ZodEnum<{
        system: "system";
        quick: "quick";
    }>;
    content: z.ZodString;
    color: z.ZodOptional<z.ZodString>;
    categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isNewConversationDefault: z.ZodOptional<z.ZodBoolean>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
    consumer: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PromptCreateProps = z.infer<typeof PromptCreateProps>;
export declare const PromptUpdateProps: z.ZodObject<{
    id: z.ZodString;
    content: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
    isNewConversationDefault: z.ZodOptional<z.ZodBoolean>;
    isDefault: z.ZodOptional<z.ZodBoolean>;
    consumer: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PromptUpdateProps = z.infer<typeof PromptUpdateProps>;
export declare const PerformPromptsBulkActionRequestBody: z.ZodObject<{
    delete: z.ZodOptional<z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    create: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        promptType: z.ZodEnum<{
            system: "system";
            quick: "quick";
        }>;
        content: z.ZodString;
        color: z.ZodOptional<z.ZodString>;
        categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
        isNewConversationDefault: z.ZodOptional<z.ZodBoolean>;
        isDefault: z.ZodOptional<z.ZodBoolean>;
        consumer: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
    update: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        content: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        categories: z.ZodOptional<z.ZodArray<z.ZodString>>;
        isNewConversationDefault: z.ZodOptional<z.ZodBoolean>;
        isDefault: z.ZodOptional<z.ZodBoolean>;
        consumer: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PerformPromptsBulkActionRequestBody = z.infer<typeof PerformPromptsBulkActionRequestBody>;
export type PerformPromptsBulkActionRequestBodyInput = z.input<typeof PerformPromptsBulkActionRequestBody>;
export declare const PerformPromptsBulkActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    status_code: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    prompts_count: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodObject<{
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
            created: z.ZodArray<z.ZodObject<{
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
            deleted: z.ZodArray<z.ZodString>;
            skipped: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"PROMPT_FIELD_NOT_MODIFIED">;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        summary: z.ZodObject<{
            failed: z.ZodNumber;
            skipped: z.ZodNumber;
            succeeded: z.ZodNumber;
            total: z.ZodNumber;
        }, z.core.$strip>;
        errors: z.ZodOptional<z.ZodArray<z.ZodObject<{
            message: z.ZodString;
            status_code: z.ZodNumber;
            err_code: z.ZodOptional<z.ZodString>;
            prompts: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PerformPromptsBulkActionResponse = z.infer<typeof PerformPromptsBulkActionResponse>;
