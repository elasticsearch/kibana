import type { AggregationsBuckets } from '@elastic/elasticsearch/lib/api/types';
export interface ConnectorsByConsumersBucket {
    key: string;
    actions: {
        connector_types: {
            buckets: Array<{
                key: string;
                doc_count: number;
            }>;
        };
    };
}
export declare function groupConnectorsByConsumers(consumers: AggregationsBuckets<ConnectorsByConsumersBucket>): Record<string, Record<string, number>>;
