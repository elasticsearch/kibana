import type { KibanaResponseFactory, IKibanaResponse } from '@kbn/core/server';
export interface ErrorThatHandlesItsOwnResponse extends Error {
    sendResponse(res: KibanaResponseFactory): IKibanaResponse;
}
export interface ElasticsearchErrorCausedByObject {
    reason?: string;
    caused_by?: ElasticsearchErrorCausedByObject;
    failed_shards?: Array<{
        reason?: {
            caused_by?: ElasticsearchErrorCausedByObject;
        };
    }>;
}
interface ElasticsearchErrorMeta {
    body?: {
        error?: ElasticsearchErrorCausedByObject;
    };
}
export interface ElasticsearchError extends Error {
    error?: {
        meta?: ElasticsearchErrorMeta;
    };
    meta?: ElasticsearchErrorMeta;
}
export {};
