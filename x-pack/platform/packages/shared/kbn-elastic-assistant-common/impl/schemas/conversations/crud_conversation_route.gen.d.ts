import { z } from '@kbn/zod/v4';
export declare const CreateConversationRequestBody: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    category: z.ZodOptional<z.ZodEnum<{
        assistant: "assistant";
        insights: "insights";
    }>>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        refusal: z.ZodOptional<z.ZodString>;
        reader: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        role: z.ZodEnum<{
            user: "user";
            system: "system";
            assistant: "assistant";
        }>;
        user: z.ZodOptional<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        isError: z.ZodOptional<z.ZodBoolean>;
        traceData: z.ZodOptional<z.ZodObject<{
            transactionId: z.ZodOptional<z.ZodString>;
            traceId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            contentReferences: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"KnowledgeBaseEntry">;
                knowledgeBaseEntryId: z.ZodString;
                knowledgeBaseEntryName: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlert">;
                alertId: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlertsPage">;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"ProductDocumentation">;
                title: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"EsqlQuery">;
                query: z.ZodString;
                label: z.ZodString;
                timerange: z.ZodOptional<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"Href">;
                label: z.ZodOptional<z.ZodString>;
                href: z.ZodString;
            }, z.core.$strip>]>>>>;
            interruptValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"SELECT_OPTION">;
                description: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    value: z.ZodString;
                    buttonColor: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        accent: "accent";
                        accentSecondary: "accentSecondary";
                        primary: "primary";
                        success: "success";
                        warning: "warning";
                        danger: "danger";
                        neutral: "neutral";
                        risk: "risk";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"INPUT_TEXT">;
                description: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
            interruptResumeValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"SELECT_OPTION">;
                value: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"INPUT_TEXT">;
                value: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excludeFromLastConversationStorage: z.ZodOptional<z.ZodBoolean>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
}, z.core.$strip>;
export type CreateConversationRequestBody = z.infer<typeof CreateConversationRequestBody>;
export type CreateConversationRequestBodyInput = z.input<typeof CreateConversationRequestBody>;
export declare const CreateConversationResponse: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    category: z.ZodEnum<{
        assistant: "assistant";
        insights: "insights";
    }>;
    timestamp: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    createdBy: z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    users: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        refusal: z.ZodOptional<z.ZodString>;
        reader: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        role: z.ZodEnum<{
            user: "user";
            system: "system";
            assistant: "assistant";
        }>;
        user: z.ZodOptional<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        isError: z.ZodOptional<z.ZodBoolean>;
        traceData: z.ZodOptional<z.ZodObject<{
            transactionId: z.ZodOptional<z.ZodString>;
            traceId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            contentReferences: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"KnowledgeBaseEntry">;
                knowledgeBaseEntryId: z.ZodString;
                knowledgeBaseEntryName: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlert">;
                alertId: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlertsPage">;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"ProductDocumentation">;
                title: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"EsqlQuery">;
                query: z.ZodString;
                label: z.ZodString;
                timerange: z.ZodOptional<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"Href">;
                label: z.ZodOptional<z.ZodString>;
                href: z.ZodString;
            }, z.core.$strip>]>>>>;
            interruptValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"SELECT_OPTION">;
                description: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    value: z.ZodString;
                    buttonColor: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        accent: "accent";
                        accentSecondary: "accentSecondary";
                        primary: "primary";
                        success: "success";
                        warning: "warning";
                        danger: "danger";
                        neutral: "neutral";
                        risk: "risk";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"INPUT_TEXT">;
                description: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
            interruptResumeValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"SELECT_OPTION">;
                value: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"INPUT_TEXT">;
                value: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excludeFromLastConversationStorage: z.ZodOptional<z.ZodBoolean>;
    namespace: z.ZodString;
}, z.core.$strip>;
export type CreateConversationResponse = z.infer<typeof CreateConversationResponse>;
export declare const DeleteAllConversationsRequestBody: z.ZodObject<{
    excludedIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type DeleteAllConversationsRequestBody = z.infer<typeof DeleteAllConversationsRequestBody>;
export type DeleteAllConversationsRequestBodyInput = z.input<typeof DeleteAllConversationsRequestBody>;
export declare const DeleteAllConversationsResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    totalDeleted: z.ZodOptional<z.ZodNumber>;
    failures: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type DeleteAllConversationsResponse = z.infer<typeof DeleteAllConversationsResponse>;
export declare const DeleteConversationRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type DeleteConversationRequestParams = z.infer<typeof DeleteConversationRequestParams>;
export type DeleteConversationRequestParamsInput = z.input<typeof DeleteConversationRequestParams>;
export declare const DeleteConversationResponse: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    category: z.ZodEnum<{
        assistant: "assistant";
        insights: "insights";
    }>;
    timestamp: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    createdBy: z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    users: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        refusal: z.ZodOptional<z.ZodString>;
        reader: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        role: z.ZodEnum<{
            user: "user";
            system: "system";
            assistant: "assistant";
        }>;
        user: z.ZodOptional<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        isError: z.ZodOptional<z.ZodBoolean>;
        traceData: z.ZodOptional<z.ZodObject<{
            transactionId: z.ZodOptional<z.ZodString>;
            traceId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            contentReferences: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"KnowledgeBaseEntry">;
                knowledgeBaseEntryId: z.ZodString;
                knowledgeBaseEntryName: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlert">;
                alertId: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlertsPage">;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"ProductDocumentation">;
                title: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"EsqlQuery">;
                query: z.ZodString;
                label: z.ZodString;
                timerange: z.ZodOptional<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"Href">;
                label: z.ZodOptional<z.ZodString>;
                href: z.ZodString;
            }, z.core.$strip>]>>>>;
            interruptValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"SELECT_OPTION">;
                description: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    value: z.ZodString;
                    buttonColor: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        accent: "accent";
                        accentSecondary: "accentSecondary";
                        primary: "primary";
                        success: "success";
                        warning: "warning";
                        danger: "danger";
                        neutral: "neutral";
                        risk: "risk";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"INPUT_TEXT">;
                description: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
            interruptResumeValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"SELECT_OPTION">;
                value: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"INPUT_TEXT">;
                value: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excludeFromLastConversationStorage: z.ZodOptional<z.ZodBoolean>;
    namespace: z.ZodString;
}, z.core.$strip>;
export type DeleteConversationResponse = z.infer<typeof DeleteConversationResponse>;
export declare const ReadConversationRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type ReadConversationRequestParams = z.infer<typeof ReadConversationRequestParams>;
export type ReadConversationRequestParamsInput = z.input<typeof ReadConversationRequestParams>;
export declare const ReadConversationResponse: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    category: z.ZodEnum<{
        assistant: "assistant";
        insights: "insights";
    }>;
    timestamp: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    createdBy: z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    users: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        refusal: z.ZodOptional<z.ZodString>;
        reader: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        role: z.ZodEnum<{
            user: "user";
            system: "system";
            assistant: "assistant";
        }>;
        user: z.ZodOptional<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        isError: z.ZodOptional<z.ZodBoolean>;
        traceData: z.ZodOptional<z.ZodObject<{
            transactionId: z.ZodOptional<z.ZodString>;
            traceId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            contentReferences: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"KnowledgeBaseEntry">;
                knowledgeBaseEntryId: z.ZodString;
                knowledgeBaseEntryName: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlert">;
                alertId: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlertsPage">;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"ProductDocumentation">;
                title: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"EsqlQuery">;
                query: z.ZodString;
                label: z.ZodString;
                timerange: z.ZodOptional<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"Href">;
                label: z.ZodOptional<z.ZodString>;
                href: z.ZodString;
            }, z.core.$strip>]>>>>;
            interruptValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"SELECT_OPTION">;
                description: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    value: z.ZodString;
                    buttonColor: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        accent: "accent";
                        accentSecondary: "accentSecondary";
                        primary: "primary";
                        success: "success";
                        warning: "warning";
                        danger: "danger";
                        neutral: "neutral";
                        risk: "risk";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"INPUT_TEXT">;
                description: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
            interruptResumeValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"SELECT_OPTION">;
                value: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"INPUT_TEXT">;
                value: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excludeFromLastConversationStorage: z.ZodOptional<z.ZodBoolean>;
    namespace: z.ZodString;
}, z.core.$strip>;
export type ReadConversationResponse = z.infer<typeof ReadConversationResponse>;
export declare const UpdateConversationRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type UpdateConversationRequestParams = z.infer<typeof UpdateConversationRequestParams>;
export type UpdateConversationRequestParamsInput = z.input<typeof UpdateConversationRequestParams>;
export declare const UpdateConversationRequestBody: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<{
        assistant: "assistant";
        insights: "insights";
    }>>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        refusal: z.ZodOptional<z.ZodString>;
        reader: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        role: z.ZodEnum<{
            user: "user";
            system: "system";
            assistant: "assistant";
        }>;
        user: z.ZodOptional<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        isError: z.ZodOptional<z.ZodBoolean>;
        traceData: z.ZodOptional<z.ZodObject<{
            transactionId: z.ZodOptional<z.ZodString>;
            traceId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            contentReferences: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"KnowledgeBaseEntry">;
                knowledgeBaseEntryId: z.ZodString;
                knowledgeBaseEntryName: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlert">;
                alertId: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlertsPage">;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"ProductDocumentation">;
                title: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"EsqlQuery">;
                query: z.ZodString;
                label: z.ZodString;
                timerange: z.ZodOptional<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"Href">;
                label: z.ZodOptional<z.ZodString>;
                href: z.ZodString;
            }, z.core.$strip>]>>>>;
            interruptValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"SELECT_OPTION">;
                description: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    value: z.ZodString;
                    buttonColor: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        accent: "accent";
                        accentSecondary: "accentSecondary";
                        primary: "primary";
                        success: "success";
                        warning: "warning";
                        danger: "danger";
                        neutral: "neutral";
                        risk: "risk";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"INPUT_TEXT">;
                description: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
            interruptResumeValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"SELECT_OPTION">;
                value: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"INPUT_TEXT">;
                value: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excludeFromLastConversationStorage: z.ZodOptional<z.ZodBoolean>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    users: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type UpdateConversationRequestBody = z.infer<typeof UpdateConversationRequestBody>;
export type UpdateConversationRequestBodyInput = z.input<typeof UpdateConversationRequestBody>;
export declare const UpdateConversationResponse: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    category: z.ZodEnum<{
        assistant: "assistant";
        insights: "insights";
    }>;
    timestamp: z.ZodOptional<z.ZodString>;
    updatedAt: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    createdBy: z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    users: z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    messages: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodString>;
        content: z.ZodString;
        refusal: z.ZodOptional<z.ZodString>;
        reader: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>>;
        role: z.ZodEnum<{
            user: "user";
            system: "system";
            assistant: "assistant";
        }>;
        user: z.ZodOptional<z.ZodObject<{
            id: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        timestamp: z.ZodString;
        isError: z.ZodOptional<z.ZodBoolean>;
        traceData: z.ZodOptional<z.ZodObject<{
            transactionId: z.ZodOptional<z.ZodString>;
            traceId: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        metadata: z.ZodOptional<z.ZodObject<{
            contentReferences: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"KnowledgeBaseEntry">;
                knowledgeBaseEntryId: z.ZodString;
                knowledgeBaseEntryName: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlert">;
                alertId: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"SecurityAlertsPage">;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"ProductDocumentation">;
                title: z.ZodString;
                url: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"EsqlQuery">;
                query: z.ZodString;
                label: z.ZodString;
                timerange: z.ZodOptional<z.ZodObject<{
                    from: z.ZodString;
                    to: z.ZodString;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                id: z.ZodString;
                type: z.ZodLiteral<"Href">;
                label: z.ZodOptional<z.ZodString>;
                href: z.ZodString;
            }, z.core.$strip>]>>>>;
            interruptValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"SELECT_OPTION">;
                description: z.ZodString;
                options: z.ZodArray<z.ZodObject<{
                    label: z.ZodString;
                    value: z.ZodString;
                    buttonColor: z.ZodOptional<z.ZodEnum<{
                        text: "text";
                        accent: "accent";
                        accentSecondary: "accentSecondary";
                        primary: "primary";
                        success: "success";
                        warning: "warning";
                        danger: "danger";
                        neutral: "neutral";
                        risk: "risk";
                    }>>;
                }, z.core.$strip>>;
            }, z.core.$strip>, z.ZodObject<{
                expired: z.ZodOptional<z.ZodBoolean>;
                threadId: z.ZodString;
                type: z.ZodLiteral<"INPUT_TEXT">;
                description: z.ZodOptional<z.ZodString>;
                placeholder: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>]>>;
            interruptResumeValue: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                type: z.ZodLiteral<"SELECT_OPTION">;
                value: z.ZodString;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"INPUT_TEXT">;
                value: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>>;
    apiConfig: z.ZodOptional<z.ZodObject<{
        connectorId: z.ZodString;
        actionTypeId: z.ZodString;
        defaultSystemPromptId: z.ZodOptional<z.ZodString>;
        provider: z.ZodOptional<z.ZodEnum<{
            OpenAI: "OpenAI";
            "Azure OpenAI": "Azure OpenAI";
            Other: "Other";
        }>>;
        model: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    excludeFromLastConversationStorage: z.ZodOptional<z.ZodBoolean>;
    namespace: z.ZodString;
}, z.core.$strip>;
export type UpdateConversationResponse = z.infer<typeof UpdateConversationResponse>;
