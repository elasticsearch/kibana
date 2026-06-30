import type { IlmPolicy } from '@elastic/elasticsearch/lib/api/types';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { DataStreamAdapter } from './data_stream_adapter';
interface CreateOrUpdateIlmPolicyOpts {
    logger: Logger;
    esClient: ElasticsearchClient;
    name: string;
    policy: IlmPolicy;
    dataStreamAdapter: DataStreamAdapter;
}
/**
 * Creates ILM policy if it doesn't already exist, updates it if it does
 */
export declare const createOrUpdateIlmPolicy: ({ logger, esClient, name, policy, dataStreamAdapter, }: CreateOrUpdateIlmPolicyOpts) => Promise<void>;
export {};
