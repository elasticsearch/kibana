import { z } from '@kbn/zod/v4';
/**
 * The reason an alert summary was skipped during a bulk action.
 */
export declare const AlertSummaryBulkActionSkipReason: z.ZodLiteral<"ALERT_SUMMARY_NOT_MODIFIED">;
export type AlertSummaryBulkActionSkipReason = z.infer<typeof AlertSummaryBulkActionSkipReason>;
/**
 * Details about an alert summary that was skipped during a bulk action.
 */
export declare const AlertSummaryBulkActionSkipResult: z.ZodObject<{
    id: z.ZodString;
    alertId: z.ZodOptional<z.ZodString>;
    skip_reason: z.ZodLiteral<"ALERT_SUMMARY_NOT_MODIFIED">;
}, z.core.$strip>;
export type AlertSummaryBulkActionSkipResult = z.infer<typeof AlertSummaryBulkActionSkipResult>;
/**
 * Details about an alert summary that encountered an error during a bulk action.
 */
export declare const AlertSummaryDetailsInError: z.ZodObject<{
    alertId: z.ZodOptional<z.ZodString>;
    id: z.ZodString;
}, z.core.$strip>;
export type AlertSummaryDetailsInError = z.infer<typeof AlertSummaryDetailsInError>;
/**
 * A normalized error object returned when one or more alert summaries fail during a bulk action.
 */
export declare const NormalizedAlertSummaryError: z.ZodObject<{
    message: z.ZodString;
    status_code: z.ZodNumber;
    err_code: z.ZodOptional<z.ZodString>;
    alert_summaries: z.ZodArray<z.ZodObject<{
        alertId: z.ZodOptional<z.ZodString>;
        id: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type NormalizedAlertSummaryError = z.infer<typeof NormalizedAlertSummaryError>;
/**
 * An alert summary created by the Elastic Assistant for a specific security alert.
 */
export declare const AlertSummaryResponse: z.ZodObject<{
    id: z.ZodString;
    alertId: z.ZodString;
    timestamp: z.ZodOptional<z.ZodString>;
    summary: z.ZodString;
    recommendedActions: z.ZodOptional<z.ZodString>;
    replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
export type AlertSummaryResponse = z.infer<typeof AlertSummaryResponse>;
/**
 * The results of a bulk action on alert summaries.
 */
export declare const AlertSummaryBulkCrudActionResults: z.ZodObject<{
    updated: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        alertId: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        summary: z.ZodString;
        recommendedActions: z.ZodOptional<z.ZodString>;
        replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
        alertId: z.ZodString;
        timestamp: z.ZodOptional<z.ZodString>;
        summary: z.ZodString;
        recommendedActions: z.ZodOptional<z.ZodString>;
        replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
        alertId: z.ZodOptional<z.ZodString>;
        skip_reason: z.ZodLiteral<"ALERT_SUMMARY_NOT_MODIFIED">;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AlertSummaryBulkCrudActionResults = z.infer<typeof AlertSummaryBulkCrudActionResults>;
export declare const AlertSummaryBulkCrudActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    status_code: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    alert_summaries_count: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                alertId: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                summary: z.ZodString;
                recommendedActions: z.ZodOptional<z.ZodString>;
                replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
                alertId: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                summary: z.ZodString;
                recommendedActions: z.ZodOptional<z.ZodString>;
                replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
                alertId: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"ALERT_SUMMARY_NOT_MODIFIED">;
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
            alert_summaries: z.ZodArray<z.ZodObject<{
                alertId: z.ZodOptional<z.ZodString>;
                id: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type AlertSummaryBulkCrudActionResponse = z.infer<typeof AlertSummaryBulkCrudActionResponse>;
export declare const AlertSummaryCreateProps: z.ZodObject<{
    alertId: z.ZodString;
    summary: z.ZodString;
    recommendedActions: z.ZodOptional<z.ZodString>;
    replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
}, z.core.$strip>;
export type AlertSummaryCreateProps = z.infer<typeof AlertSummaryCreateProps>;
export declare const AlertSummaryUpdateProps: z.ZodObject<{
    id: z.ZodString;
    summary: z.ZodOptional<z.ZodString>;
    recommendedActions: z.ZodOptional<z.ZodString>;
    replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
}, z.core.$strip>;
export type AlertSummaryUpdateProps = z.infer<typeof AlertSummaryUpdateProps>;
export declare const PerformAlertSummaryBulkActionRequestBody: z.ZodObject<{
    delete: z.ZodOptional<z.ZodObject<{
        query: z.ZodOptional<z.ZodString>;
        ids: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    create: z.ZodOptional<z.ZodArray<z.ZodObject<{
        alertId: z.ZodString;
        summary: z.ZodString;
        recommendedActions: z.ZodOptional<z.ZodString>;
        replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
    }, z.core.$strip>>>;
    update: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        summary: z.ZodOptional<z.ZodString>;
        recommendedActions: z.ZodOptional<z.ZodString>;
        replacements: z.ZodOptional<z.ZodObject<{}, z.core.$catchall<z.ZodString>>>;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PerformAlertSummaryBulkActionRequestBody = z.infer<typeof PerformAlertSummaryBulkActionRequestBody>;
export type PerformAlertSummaryBulkActionRequestBodyInput = z.input<typeof PerformAlertSummaryBulkActionRequestBody>;
export declare const PerformAlertSummaryBulkActionResponse: z.ZodObject<{
    success: z.ZodOptional<z.ZodBoolean>;
    status_code: z.ZodOptional<z.ZodNumber>;
    message: z.ZodOptional<z.ZodString>;
    alert_summaries_count: z.ZodOptional<z.ZodNumber>;
    attributes: z.ZodObject<{
        results: z.ZodObject<{
            updated: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                alertId: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                summary: z.ZodString;
                recommendedActions: z.ZodOptional<z.ZodString>;
                replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
                alertId: z.ZodString;
                timestamp: z.ZodOptional<z.ZodString>;
                summary: z.ZodString;
                recommendedActions: z.ZodOptional<z.ZodString>;
                replacements: z.ZodObject<{}, z.core.$catchall<z.ZodString>>;
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
                alertId: z.ZodOptional<z.ZodString>;
                skip_reason: z.ZodLiteral<"ALERT_SUMMARY_NOT_MODIFIED">;
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
            alert_summaries: z.ZodArray<z.ZodObject<{
                alertId: z.ZodOptional<z.ZodString>;
                id: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type PerformAlertSummaryBulkActionResponse = z.infer<typeof PerformAlertSummaryBulkActionResponse>;
