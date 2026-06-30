export declare const RETRY_IF_CONFLICTS_ATTEMPTS = 3;
export declare const RETRY_IF_CONFLICTS_DELAY = 250;
export declare const randomDelayMs: number;
export declare const getExponentialDelayMultiplier: (retries: number) => number;
/**
 * exponential delay before retry with adding random delay
 */
export declare const waitBeforeNextRetry: (retries: number) => Promise<void>;
