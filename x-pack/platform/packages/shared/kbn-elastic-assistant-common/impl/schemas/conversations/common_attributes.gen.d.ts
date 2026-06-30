import { z } from '@kbn/zod/v4';
/**
 * Trace Data
 */
export declare const TraceData: z.ZodObject<{
    transactionId: z.ZodOptional<z.ZodString>;
    traceId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TraceData = z.infer<typeof TraceData>;
/**
 * The type of interrupt
 */
export declare const InterruptType: z.ZodEnum<{
    SELECT_OPTION: "SELECT_OPTION";
    INPUT_TEXT: "INPUT_TEXT";
}>;
export type InterruptType = z.infer<typeof InterruptType>;
export type InterruptTypeEnum = typeof InterruptType.enum;
export declare const InterruptTypeEnum: {
    SELECT_OPTION: "SELECT_OPTION";
    INPUT_TEXT: "INPUT_TEXT";
};
/**
 * The basis of an agent interrupt
 */
export declare const BaseInterruptValue: z.ZodObject<{
    type: z.ZodEnum<{
        SELECT_OPTION: "SELECT_OPTION";
        INPUT_TEXT: "INPUT_TEXT";
    }>;
    expired: z.ZodOptional<z.ZodBoolean>;
    threadId: z.ZodString;
}, z.core.$strip>;
export type BaseInterruptValue = z.infer<typeof BaseInterruptValue>;
/**
 * The basis of an interrupt resume value
 */
export declare const BaseInterruptResumeValue: z.ZodObject<{
    type: z.ZodEnum<{
        SELECT_OPTION: "SELECT_OPTION";
        INPUT_TEXT: "INPUT_TEXT";
    }>;
}, z.core.$strip>;
export type BaseInterruptResumeValue = z.infer<typeof BaseInterruptResumeValue>;
/**
 * A request approval option
 */
export declare const SelectOptionInterruptOption: z.ZodObject<{
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
}, z.core.$strip>;
export type SelectOptionInterruptOption = z.infer<typeof SelectOptionInterruptOption>;
/**
 * Interrupt that requests user to select one of the provided options
 */
export declare const SelectOptionInterruptValue: z.ZodObject<{
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
}, z.core.$strip>;
export type SelectOptionInterruptValue = z.infer<typeof SelectOptionInterruptValue>;
/**
 * A request approval resume schema
 */
export declare const SelectOptionInterruptResumeValue: z.ZodObject<{
    type: z.ZodLiteral<"SELECT_OPTION">;
    value: z.ZodString;
}, z.core.$strip>;
export type SelectOptionInterruptResumeValue = z.infer<typeof SelectOptionInterruptResumeValue>;
/**
 * A request approval interrupt
 */
export declare const SelectOptionInterrupt: z.ZodObject<{
    interruptValue: z.ZodObject<{
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
    }, z.core.$strip>;
    resumeValue: z.ZodObject<{
        type: z.ZodLiteral<"SELECT_OPTION">;
        value: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type SelectOptionInterrupt = z.infer<typeof SelectOptionInterrupt>;
/**
 * Interrupt that requests user to provide text input
 */
export declare const InputTextInterruptValue: z.ZodObject<{
    expired: z.ZodOptional<z.ZodBoolean>;
    threadId: z.ZodString;
    type: z.ZodLiteral<"INPUT_TEXT">;
    description: z.ZodOptional<z.ZodString>;
    placeholder: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type InputTextInterruptValue = z.infer<typeof InputTextInterruptValue>;
/**
 * A resume value for input text
 */
export declare const InputTextInterruptResumeValue: z.ZodObject<{
    type: z.ZodLiteral<"INPUT_TEXT">;
    value: z.ZodString;
}, z.core.$strip>;
export type InputTextInterruptResumeValue = z.infer<typeof InputTextInterruptResumeValue>;
/**
 * A request text interrupt
 */
export declare const InputTextInterrupt: z.ZodObject<{
    interruptValue: z.ZodObject<{
        expired: z.ZodOptional<z.ZodBoolean>;
        threadId: z.ZodString;
        type: z.ZodLiteral<"INPUT_TEXT">;
        description: z.ZodOptional<z.ZodString>;
        placeholder: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    resumeValue: z.ZodObject<{
        type: z.ZodLiteral<"INPUT_TEXT">;
        value: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export type InputTextInterrupt = z.infer<typeof InputTextInterrupt>;
/**
 * Union of the interrupt values
 */
export declare const InterruptValue: z.ZodUnion<readonly [z.ZodObject<{
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
}, z.core.$strip>]>;
export type InterruptValue = z.infer<typeof InterruptValue>;
/**
 * Union of the interrupt resume values
 */
export declare const InterruptResumeValue: z.ZodUnion<readonly [z.ZodObject<{
    type: z.ZodLiteral<"SELECT_OPTION">;
    value: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"INPUT_TEXT">;
    value: z.ZodString;
}, z.core.$strip>]>;
export type InterruptResumeValue = z.infer<typeof InterruptResumeValue>;
/**
 * The basis of a content reference
 */
export declare const BaseContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
}, z.core.$strip>;
export type BaseContentReference = z.infer<typeof BaseContentReference>;
/**
 * References a knowledge base entry
 */
export declare const KnowledgeBaseEntryContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"KnowledgeBaseEntry">;
    knowledgeBaseEntryId: z.ZodString;
    knowledgeBaseEntryName: z.ZodString;
}, z.core.$strip>;
export type KnowledgeBaseEntryContentReference = z.infer<typeof KnowledgeBaseEntryContentReference>;
/**
 * References an ESQL query
 */
export declare const EsqlContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"EsqlQuery">;
    query: z.ZodString;
    label: z.ZodString;
    timerange: z.ZodOptional<z.ZodObject<{
        from: z.ZodString;
        to: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EsqlContentReference = z.infer<typeof EsqlContentReference>;
/**
 * References a security alert
 */
export declare const SecurityAlertContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"SecurityAlert">;
    alertId: z.ZodString;
}, z.core.$strip>;
export type SecurityAlertContentReference = z.infer<typeof SecurityAlertContentReference>;
/**
 * References an external URL
 */
export declare const HrefContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"Href">;
    label: z.ZodOptional<z.ZodString>;
    href: z.ZodString;
}, z.core.$strip>;
export type HrefContentReference = z.infer<typeof HrefContentReference>;
/**
 * References the security alerts page
 */
export declare const SecurityAlertsPageContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"SecurityAlertsPage">;
}, z.core.$strip>;
export type SecurityAlertsPageContentReference = z.infer<typeof SecurityAlertsPageContentReference>;
/**
 * References the product documentation
 */
export declare const ProductDocumentationContentReference: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"ProductDocumentation">;
    title: z.ZodString;
    url: z.ZodString;
}, z.core.$strip>;
export type ProductDocumentationContentReference = z.infer<typeof ProductDocumentationContentReference>;
/**
 * A content reference
 */
export declare const ContentReferenceInternal: z.ZodUnion<readonly [z.ZodObject<{
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
}, z.core.$strip>]>;
export type ContentReference = z.infer<typeof ContentReferenceInternal>;
export declare const ContentReference: z.ZodType<ContentReference>;
/**
 * A union of all content reference types
 */
export declare const ContentReferences: z.ZodObject<{}, z.core.$catchall<z.ZodUnion<readonly [z.ZodObject<{
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
}, z.core.$strip>]>>>;
export type ContentReferences = z.infer<typeof ContentReferences>;
/**
 * Message metadata
 */
export declare const MessageMetadata: z.ZodObject<{
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
}, z.core.$strip>;
export type MessageMetadata = z.infer<typeof MessageMetadata>;
/**
 * Replacements object used to anonymize/deanonymize messages
 */
export declare const Replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
export type Replacements = z.infer<typeof Replacements>;
export declare const Reader: z.ZodObject<{}, z.core.$catchall<z.ZodUnknown>>;
export type Reader = z.infer<typeof Reader>;
/**
 * Provider
 */
export declare const Provider: z.ZodEnum<{
    OpenAI: "OpenAI";
    "Azure OpenAI": "Azure OpenAI";
    Other: "Other";
}>;
export type Provider = z.infer<typeof Provider>;
export type ProviderEnum = typeof Provider.enum;
export declare const ProviderEnum: {
    OpenAI: "OpenAI";
    "Azure OpenAI": "Azure OpenAI";
    Other: "Other";
};
/**
 * Message role.
 */
export declare const MessageRole: z.ZodEnum<{
    user: "user";
    system: "system";
    assistant: "assistant";
}>;
export type MessageRole = z.infer<typeof MessageRole>;
export type MessageRoleEnum = typeof MessageRole.enum;
export declare const MessageRoleEnum: {
    user: "user";
    system: "system";
    assistant: "assistant";
};
/**
 * The conversation category.
 */
export declare const ConversationCategory: z.ZodEnum<{
    assistant: "assistant";
    insights: "insights";
}>;
export type ConversationCategory = z.infer<typeof ConversationCategory>;
export type ConversationCategoryEnum = typeof ConversationCategory.enum;
export declare const ConversationCategoryEnum: {
    assistant: "assistant";
    insights: "insights";
};
/**
 * AI assistant conversation message.
 */
export declare const Message: z.ZodObject<{
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
}, z.core.$strip>;
export type Message = z.infer<typeof Message>;
export declare const ApiConfig: z.ZodObject<{
    connectorId: z.ZodString;
    actionTypeId: z.ZodString;
    defaultSystemPromptId: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodEnum<{
        OpenAI: "OpenAI";
        "Azure OpenAI": "Azure OpenAI";
        Other: "Other";
    }>>;
    model: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ApiConfig = z.infer<typeof ApiConfig>;
export declare const ErrorSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    error: z.ZodObject<{
        status_code: z.ZodNumber;
        message: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strict>;
export type ErrorSchema = z.infer<typeof ErrorSchema>;
export declare const ConversationResponse: z.ZodObject<{
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
export type ConversationResponse = z.infer<typeof ConversationResponse>;
export declare const ConversationUpdateProps: z.ZodObject<{
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
export type ConversationUpdateProps = z.infer<typeof ConversationUpdateProps>;
export declare const ConversationCreateProps: z.ZodObject<{
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
export type ConversationCreateProps = z.infer<typeof ConversationCreateProps>;
export declare const ConversationMessageCreateProps: z.ZodObject<{
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
export type ConversationMessageCreateProps = z.infer<typeof ConversationMessageCreateProps>;
