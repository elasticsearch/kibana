import type { Logger } from '@kbn/core/server';
export declare const retryTransientEsErrors: <T>(esCall: () => Promise<T>, { logger, attempt, }: {
    logger: Logger;
    attempt?: number;
}) => Promise<T>;
