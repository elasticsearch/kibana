export declare const ruleTagsAggregationResultSchema: import("@kbn/config-schema").ObjectType<{
    tags: import("@kbn/config-schema").ObjectType<{
        buckets: import("@kbn/config-schema").Type<Readonly<{} & {
            key: string;
            doc_count: number;
        }>[]>;
    }>;
}>;
