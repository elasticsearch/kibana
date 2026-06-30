import { z } from '@kbn/zod/v4';
/**
 * Reason why the anonymization field was not modified.
 */
export declare const AnonymizationFieldsBulkActionSkipReason: z.ZodLiteral<"ANONYMIZATION_FIELD_NOT_MODIFIED">;
export type AnonymizationFieldsBulkActionSkipReason = z.infer<typeof AnonymizationFieldsBulkActionSkipReason>;
export declare const AnonymizationFieldsBulkActionSkipResult: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    skip_reason: z.ZodLiteral<"ANONYMIZATION_FIELD_NOT_MODIFIED">;
}, z.core.$strip>;
export type AnonymizationFieldsBulkActionSkipResult = z.infer<typeof AnonymizationFieldsBulkActionSkipResult>;
export declare const AnonymizationFieldDetailsInError: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AnonymizationFieldDetailsInError = z.infer<typeof AnonymizationFieldDetailsInError>;
export declare const NormalizedAnonymizationFieldError: z.ZodObject<{
    message: z.ZodString;
    status_code: z.ZodNumber;
    err_code: z.ZodOptional<z.ZodString>;
    anonymization_fields: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type NormalizedAnonymizationFieldError = z.infer<typeof NormalizedAnonymizationFieldError>;
export declare const AnonymizationFieldResponse: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
    field: z.ZodString;
    allowed: z.ZodOptional<z.ZodBoolean>;
    anonymized: z.ZodOptional<z.ZodBoolean>;
    updatedAt: z.ZodOptional<z.ZodString>;
    updatedBy: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodOptional<z.ZodString>;
    createdBy: z.ZodOptional<z.ZodString>;
    namespace: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AnonymizationFieldResponse = z.infer<typeof AnonymizationFieldResponse>;
export declare const AnonymizationFieldsBulkCrudActionResults: z.ZodObject<{
    updated: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        field: z.ZodString;
        allowed: z.ZodOptional<z.ZodBoolean>;
        anonymized: z.ZodOptional<z.ZodBoolean>;
        updatedAt: z.ZodOptional<z.ZodString>;
        updatedBy: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodOptional<z.ZodString>;
        namespace: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    created: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        field: z.ZodString;
        allowed: z.ZodOptional<z.ZodBoolean>;
        anonymized: z.ZodOptional<z.ZodBoolean>;
        updatedAt: z.ZodOptional<z.ZodString>;
        updatedBy: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodOptional<z.ZodString>;
        createdBy: z.ZodOptional<z.ZodString>;
        namespace: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    deleted: z.ZodArray<z.ZodString>;
    skipped: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodOptional<z.ZodString>;
        skip_reason: z.ZodLiteral<"ANONYMIZATION_FIELD_NOT_MODIFIED">;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AnonymizationFieldsBulkCrudActionResults = z.infer<typeof AnonymizationFieldsBulkCrudActionResults>;
export declare const AnonymizationFieldsBulkCrudActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    status_code: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    anonymization_fields_count: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                field: z.ZodString;
                allowed: z.ZodOptional<z.ZodBoolean>;
                anonymized: z.ZodOptional<z.ZodBoolean>;
                updatedAt: z.ZodOptional<z.ZodString>;
                updatedBy: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodOptional<z.ZodString>;
                createdBy: z.ZodOptional<z.ZodString>;
                namespace: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            created: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                field: z.ZodString;
                allowed: z.ZodOptional<z.ZodBoolean>;
                anonymized: z.ZodOptional<z.ZodBoolean>;
                updatedAt: z.ZodOptional<z.ZodString>;
                updatedBy: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodOptional<z.ZodString>;
                createdBy: z.ZodOptional<z.ZodString>;
                namespace: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            deleted: z.ZodArray<z.ZodString>;
            skipped: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"ANONYMIZATION_FIELD_NOT_MODIFIED">;
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
            anonymization_fields: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AnonymizationFieldsBulkCrudActionResponse = z.infer<typeof AnonymizationFieldsBulkCrudActionResponse>;
export declare const AnonymizationFieldCreateProps: z.ZodObject<{
    field: z.ZodString;
    allowed: z.ZodOptional<z.ZodBoolean>;
    anonymized: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AnonymizationFieldCreateProps = z.infer<typeof AnonymizationFieldCreateProps>;
export declare const AnonymizationFieldUpdateProps: z.ZodObject<{
    id: z.ZodString;
    allowed: z.ZodOptional<z.ZodBoolean>;
    anonymized: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type AnonymizationFieldUpdateProps = z.infer<typeof AnonymizationFieldUpdateProps>;
export declare const PerformAnonymizationFieldsBulkActionRequestBody: z.ZodObject<{
    delete: z.ZodOptional<z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    create: z.ZodOptional<z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        allowed: z.ZodOptional<z.ZodBoolean>;
        anonymized: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
    update: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        allowed: z.ZodOptional<z.ZodBoolean>;
        anonymized: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PerformAnonymizationFieldsBulkActionRequestBody = z.infer<typeof PerformAnonymizationFieldsBulkActionRequestBody>;
export type PerformAnonymizationFieldsBulkActionRequestBodyInput = z.input<typeof PerformAnonymizationFieldsBulkActionRequestBody>;
export declare const PerformAnonymizationFieldsBulkActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    status_code: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    anonymization_fields_count: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                field: z.ZodString;
                allowed: z.ZodOptional<z.ZodBoolean>;
                anonymized: z.ZodOptional<z.ZodBoolean>;
                updatedAt: z.ZodOptional<z.ZodString>;
                updatedBy: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodOptional<z.ZodString>;
                createdBy: z.ZodOptional<z.ZodString>;
                namespace: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            created: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                field: z.ZodString;
                allowed: z.ZodOptional<z.ZodBoolean>;
                anonymized: z.ZodOptional<z.ZodBoolean>;
                updatedAt: z.ZodOptional<z.ZodString>;
                updatedBy: z.ZodOptional<z.ZodString>;
                createdAt: z.ZodOptional<z.ZodString>;
                createdBy: z.ZodOptional<z.ZodString>;
                namespace: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            deleted: z.ZodArray<z.ZodString>;
            skipped: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"ANONYMIZATION_FIELD_NOT_MODIFIED">;
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
            anonymization_fields: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PerformAnonymizationFieldsBulkActionResponse = z.infer<typeof PerformAnonymizationFieldsBulkActionResponse>;
