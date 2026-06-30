import { z } from '@kbn/zod/v4';
export declare const FindAlertSummarySortField: z.ZodEnum<{
    created_at: "created_at";
    updated_at: "updated_at";
}>;
export type FindAlertSummarySortField = z.infer<typeof FindAlertSummarySortField>;
export type FindAlertSummarySortFieldEnum = typeof FindAlertSummarySortField.enum;
export declare const FindAlertSummarySortFieldEnum: {
    created_at: "created_at";
    updated_at: "updated_at";
};
export declare const FindAlertSummaryRequestQuery: z.ZodObject<{
    fields: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    filter: z.ZodOptional<z.ZodString>;
    connector_id: z.ZodString;
    sort_field: z.ZodOptional<z.ZodEnum<{
        created_at: "created_at";
        updated_at: "updated_at";
    }>>;
    sort_order: z.ZodOptional<z.ZodEnum<{
        desc: "desc";
        asc: "asc";
    }>>;
    page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    per_page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
}, z.core.$strip>;
export type FindAlertSummaryRequestQuery = z.infer<typeof FindAlertSummaryRequestQuery>;
export type FindAlertSummaryRequestQueryInput = z.input<typeof FindAlertSummaryRequestQuery>;
export declare const FindAlertSummaryResponse: z.ZodObject<{
    prompt: z.ZodString;
    page: z.ZodNumber;
    perPage: z.ZodNumber;
    total: z.ZodNumber;
    data: z.ZodArray<z.ZodObject<{
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
}, z.core.$strip>;
export type FindAlertSummaryResponse = z.infer<typeof FindAlertSummaryResponse>;
