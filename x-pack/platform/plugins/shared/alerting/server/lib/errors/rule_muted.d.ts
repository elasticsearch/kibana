import type { KibanaResponseFactory } from '@kbn/core/server';
import type { ErrorThatHandlesItsOwnResponse } from './types';
export declare class RuleMutedError extends Error implements ErrorThatHandlesItsOwnResponse {
    constructor(message: string);
    sendResponse(res: KibanaResponseFactory): import("@kbn/core/server").IKibanaResponse<any>;
}
