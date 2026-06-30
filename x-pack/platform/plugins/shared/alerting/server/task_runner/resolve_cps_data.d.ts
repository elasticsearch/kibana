import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { CpsData } from '../types';
export declare const resolveCpsData: (esClient: ElasticsearchClient, spaceId: string, logger: Logger) => Promise<CpsData>;
