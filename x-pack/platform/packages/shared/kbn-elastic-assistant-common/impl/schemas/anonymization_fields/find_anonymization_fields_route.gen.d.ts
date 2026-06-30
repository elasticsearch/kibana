import { z } from '@kbn/zod/v4';
export declare const FindAnonymizationFieldsSortField: z.ZodEnum<{
    field: "field";
    created_at: "created_at";
    updated_at: "updated_at";
    allowed: "allowed";
    anonymized: "anonymized";
}>;
export type FindAnonymizationFieldsSortField = z.infer<typeof FindAnonymizationFieldsSortField>;
export type FindAnonymizationFieldsSortFieldEnum = typeof FindAnonymizationFieldsSortField.enum;
export declare const FindAnonymizationFieldsSortFieldEnum: {
    field: "field";
    created_at: "created_at";
    updated_at: "updated_at";
    allowed: "allowed";
    anonymized: "anonymized";
};
export declare const FindAnonymizationFieldsRequestQuery: z.ZodObject<{
    fields: z.ZodOptional<z.ZodPreprocess<z.ZodArray<z.ZodString>>>;
    filter: z.ZodOptional<z.ZodString>;
    sort_field: z.ZodOptional<z.ZodEnum<{
        field: "field";
        created_at: "created_at";
        updated_at: "updated_at";
        allowed: "allowed";
        anonymized: "anonymized";
    }>>;
    sort_order: z.ZodOptional<z.ZodEnum<{
        desc: "desc";
        asc: "asc";
    }>>;
    page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    per_page: z.ZodDefault<z.ZodOptional<z.ZodCoercedNumber<unknown>>>;
    all_data: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodEnum<{
        true: "true";
        false: "false";
    }>, z.ZodTransform<boolean, "true" | "false">>, z.ZodBoolean]> & import("@kbn/zod-helpers/v4/kbn_zod_types/kbn_zod_type").KbnZodType>;
}, z.core.$strip>;
export type FindAnonymizationFieldsRequestQuery = z.infer<typeof FindAnonymizationFieldsRequestQuery>;
export type FindAnonymizationFieldsRequestQueryInput = z.input<typeof FindAnonymizationFieldsRequestQuery>;
export declare const FindAnonymizationFieldsResponse: z.ZodObject<{
    page: z.ZodNumber;
    perPage: z.ZodNumber;
    total: z.ZodNumber;
    data: z.ZodArray<z.ZodObject<{
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
    all: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    aggregations: z.ZodOptional<z.ZodObject<{
        field_status: z.ZodOptional<z.ZodObject<{
            buckets: z.ZodOptional<z.ZodObject<{
                anonymized: z.ZodOptional<z.ZodObject<{
                    doc_count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
                }, z.core.$strip>>;
                allowed: z.ZodOptional<z.ZodObject<{
                    doc_count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
                }, z.core.$strip>>;
                denied: z.ZodOptional<z.ZodObject<{
                    doc_count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type FindAnonymizationFieldsResponse = z.infer<typeof FindAnonymizationFieldsResponse>;
