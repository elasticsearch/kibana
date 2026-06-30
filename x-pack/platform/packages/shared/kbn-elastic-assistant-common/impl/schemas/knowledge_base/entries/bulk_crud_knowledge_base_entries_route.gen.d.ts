import { z } from '@kbn/zod/v4';
/**
 * Reason why a Knowledge Base Entry was skipped during the bulk action.
 */
export declare const KnowledgeBaseEntryBulkActionSkipReason: z.ZodLiteral<"KNOWLEDGE_BASE_ENTRY_NOT_MODIFIED">;
export type KnowledgeBaseEntryBulkActionSkipReason = z.infer<typeof KnowledgeBaseEntryBulkActionSkipReason>;
export declare const KnowledgeBaseEntryBulkActionSkipResult: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    skip_reason: z.ZodLiteral<"KNOWLEDGE_BASE_ENTRY_NOT_MODIFIED">;
}, z.core.$strip>;
export type KnowledgeBaseEntryBulkActionSkipResult = z.infer<typeof KnowledgeBaseEntryBulkActionSkipResult>;
export declare const KnowledgeBaseEntryDetailsInError: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type KnowledgeBaseEntryDetailsInError = z.infer<typeof KnowledgeBaseEntryDetailsInError>;
export declare const NormalizedKnowledgeBaseEntryError: z.ZodObject<{
    message: z.ZodString;
    statusCode: z.ZodNumber;
    err_code: z.ZodOptional<z.ZodString>;
    knowledgeBaseEntries: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type NormalizedKnowledgeBaseEntryError = z.infer<typeof NormalizedKnowledgeBaseEntryError>;
export declare const KnowledgeBaseEntryBulkCrudActionResults: z.ZodObject<{
    updated: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    created: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    deleted: z.ZodArray<z.ZodString>;
    skipped: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        skip_reason: z.ZodLiteral<"KNOWLEDGE_BASE_ENTRY_NOT_MODIFIED">;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type KnowledgeBaseEntryBulkCrudActionResults = z.infer<typeof KnowledgeBaseEntryBulkCrudActionResults>;
export declare const KnowledgeBaseEntryBulkCrudActionSummary: z.ZodObject<{
    failed: z.ZodNumber;
    skipped: z.ZodNumber;
    succeeded: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>;
export type KnowledgeBaseEntryBulkCrudActionSummary = z.infer<typeof KnowledgeBaseEntryBulkCrudActionSummary>;
export declare const KnowledgeBaseEntryBulkCrudActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    statusCode: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    knowledgeBaseEntriesCount: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
            created: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
            deleted: z.ZodArray<z.ZodString>;
            skipped: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"KNOWLEDGE_BASE_ENTRY_NOT_MODIFIED">;
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
            statusCode: z.ZodNumber;
            err_code: z.ZodOptional<z.ZodString>;
            knowledgeBaseEntries: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type KnowledgeBaseEntryBulkCrudActionResponse = z.infer<typeof KnowledgeBaseEntryBulkCrudActionResponse>;
export declare const KnowledgeBaseEntryBulkActionBase: z.ZodObject<{
    query: z.ZodOptional<z.ZodString>;
    ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type KnowledgeBaseEntryBulkActionBase = z.infer<typeof KnowledgeBaseEntryBulkActionBase>;
export declare const PerformKnowledgeBaseEntryBulkActionRequestBody: z.ZodObject<{
    delete: z.ZodOptional<z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    create: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "type">>>;
    update: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "type">>>;
}, z.core.$strip>;
export type PerformKnowledgeBaseEntryBulkActionRequestBody = z.infer<typeof PerformKnowledgeBaseEntryBulkActionRequestBody>;
export type PerformKnowledgeBaseEntryBulkActionRequestBodyInput = z.input<typeof PerformKnowledgeBaseEntryBulkActionRequestBody>;
export declare const PerformKnowledgeBaseEntryBulkActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    statusCode: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    knowledgeBaseEntriesCount: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
            created: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
            deleted: z.ZodArray<z.ZodString>;
            skipped: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"KNOWLEDGE_BASE_ENTRY_NOT_MODIFIED">;
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
            statusCode: z.ZodNumber;
            err_code: z.ZodOptional<z.ZodString>;
            knowledgeBaseEntries: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PerformKnowledgeBaseEntryBulkActionResponse = z.infer<typeof PerformKnowledgeBaseEntryBulkActionResponse>;
