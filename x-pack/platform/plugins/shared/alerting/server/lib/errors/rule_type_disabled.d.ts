import type { KibanaResponseFactory } from '@kbn/core/server';
import type { ErrorThatHandlesItsOwnResponse } from './types';
export type RuleTypeDisabledReason = 'config' | 'license_unavailable' | 'license_invalid' | 'license_expired';
export declare class RuleTypeDisabledError extends Error implements ErrorThatHandlesItsOwnResponse {
    readonly reason: RuleTypeDisabledReason;
    constructor(message: string, reason: RuleTypeDisabledReason);
    sendResponse(res: KibanaResponseFactory): import("@kbn/core/server").IKibanaResponse<any>;
}
