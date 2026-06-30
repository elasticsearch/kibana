import type { ClusterPutComponentTemplateRequest } from '@elastic/elasticsearch/lib/api/types';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
interface CreateOrUpdateComponentTemplateOpts {
    logger: Logger;
    esClient: ElasticsearchClient;
    template: ClusterPutComponentTemplateRequest;
    totalFieldsLimit: number;
}
export declare const createOrUpdateComponentTemplate: ({ logger, esClient, template, totalFieldsLimit, }: CreateOrUpdateComponentTemplateOpts) => Promise<void>;
export {};
