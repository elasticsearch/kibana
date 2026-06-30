import type { RequestHandlerWrapper } from '@kbn/core/server';
export declare const handleDisabledApiKeysError: RequestHandlerWrapper;
export declare function isApiKeyDisabledError(e: Error): boolean;
export declare function isSecurityPluginDisabledError(e: Error): boolean;
