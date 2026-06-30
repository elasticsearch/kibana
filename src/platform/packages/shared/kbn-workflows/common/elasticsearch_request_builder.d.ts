import type { RequestOptions } from '../types/latest';
/**
 * Builds an Elasticsearch request from connector definitions
 * This is shared between the execution engine and the YAML editor copy functionality
 */
export declare function buildElasticsearchRequest(stepType: string, params: Record<string, unknown>): RequestOptions;
