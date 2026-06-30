import type { Observable } from 'rxjs';
import type { Logger } from '@kbn/core/server';
interface InstallWithTimeoutOpts {
    description?: string;
    installFn: () => Promise<void>;
    pluginStop$: Observable<void>;
    logger: Logger;
    timeoutMs?: number;
}
export declare class InstallShutdownError extends Error {
    constructor();
}
export declare const installWithTimeout: ({ description, installFn, pluginStop$, logger, timeoutMs, }: InstallWithTimeoutOpts) => Promise<void>;
export {};
