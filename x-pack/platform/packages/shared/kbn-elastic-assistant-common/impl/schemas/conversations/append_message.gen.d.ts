import { z } from '@kbn/zod/v4';
export declare const AppendConversationMessageRequestParams: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strip>;
export type AppendConversationMessageRequestParams = z.infer<typeof AppendConversationMessageRequestParams>;
export type AppendConversationMessageRequestParamsInput = z.input<typeof AppendConversationMessageRequestParams>;
export declare const AppendConversationMessageRequestBody: z.ZodObject<{
    messages: z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AppendConversationMessageRequestBody = z.infer<typeof AppendConversationMessageRequestBody>;
export type AppendConversationMessageRequestBodyInput = z.input<typeof AppendConversationMessageRequestBody>;
export declare const AppendConversationMessageResponse: z.ZodObject<{
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
export type AppendConversationMessageResponse = z.infer<typeof AppendConversationMessageResponse>;
