/**
 * Elasticsearch mappings for change history documents.
 * Uses unmapped fields for variable structures (`object.snapshot`: full object after each change)
 * and flattened type for `metadata`.
 * Do not map `kibana.space_ids` here — `@kbn/data-streams` injects reserved `kibana` mappings for all data streams.
 * For field reference @see [README.md]
 */
export declare const changeHistoryMappings: {
    v1: {
        dynamic: false;
        properties: {
            '@timestamp': import("@kbn/es-mappings").DateMapping;
            ecs: import("@kbn/es-mappings").ObjectMapping<{
                version: import("@kbn/es-mappings").KeywordMapping;
            }>;
            user: import("@kbn/es-mappings").ObjectMapping<{
                id: import("@kbn/es-mappings").KeywordMapping;
                name: import("@kbn/es-mappings").KeywordMapping;
            }>;
            event: import("@kbn/es-mappings").ObjectMapping<{
                id: import("@kbn/es-mappings").KeywordMapping;
                module: import("@kbn/es-mappings").KeywordMapping;
                dataset: import("@kbn/es-mappings").KeywordMapping;
                action: import("@kbn/es-mappings").KeywordMapping;
                type: import("@kbn/es-mappings").KeywordMapping;
                reason: import("@kbn/es-mappings").TextMapping;
                created: import("@kbn/es-mappings").DateMapping;
            }>;
            span: import("@kbn/es-mappings").ObjectMapping<{
                id: import("@kbn/es-mappings").KeywordMapping;
            }>;
            object: import("@kbn/es-mappings").ObjectMapping<{
                id: import("@kbn/es-mappings").KeywordMapping;
                type: import("@kbn/es-mappings").KeywordMapping;
                hash: import("@kbn/es-mappings").KeywordMapping;
                sequence: import("@kbn/es-mappings").LongMapping;
                fields: import("@kbn/es-mappings").ObjectMapping<{
                    hashed: import("@kbn/es-mappings").KeywordMapping;
                }>;
            }>;
            tags: import("@kbn/es-mappings").KeywordMapping;
            metadata: import("@kbn/es-mappings").FlattenedMapping;
            service: import("@kbn/es-mappings").ObjectMapping<{
                type: import("@kbn/es-mappings").KeywordMapping;
                version: import("@kbn/es-mappings").KeywordMapping;
            }>;
        };
    };
};
