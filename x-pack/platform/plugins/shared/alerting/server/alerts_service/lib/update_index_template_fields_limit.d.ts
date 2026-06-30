import type { ElasticsearchClient } from '@kbn/core/server';
import type { IndicesGetIndexTemplateIndexTemplateItem } from '@elastic/elasticsearch/lib/api/types';
export declare const updateIndexTemplateFieldsLimit: ({ esClient, template, limit, }: {
    esClient: ElasticsearchClient;
    template: IndicesGetIndexTemplateIndexTemplateItem;
    limit: number;
}) => Promise<import("@elastic/elasticsearch/lib/api/types").AcknowledgedResponseBase>;
