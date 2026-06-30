export interface DefaultRuleAggregationResult {
    status: {
        buckets: Array<{
            key: string;
            doc_count: number;
        }>;
    };
    outcome: {
        buckets: Array<{
            key: string;
            doc_count: number;
        }>;
    };
    muted: {
        buckets: Array<{
            key: number;
            key_as_string: string;
            doc_count: number;
        }>;
    };
    enabled: {
        buckets: Array<{
            key: number;
            key_as_string: string;
            doc_count: number;
        }>;
    };
    snoozed: {
        count: {
            doc_count: number;
        };
    };
    tags: {
        buckets: Array<{
            key: string;
            doc_count: number;
        }>;
    };
}
