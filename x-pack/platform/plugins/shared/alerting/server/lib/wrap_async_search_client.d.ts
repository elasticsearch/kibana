import type { IScopedSearchClient } from '@kbn/data-plugin/server';
import type { Logger } from '@kbn/core/server';
import type { AsyncSearchClient } from '../task_runner/types';
import type { AsyncSearchParams, AsyncSearchStrategies } from '../types';
import type { RuleInfo } from './types';
export declare function wrapAsyncSearchClient<P extends AsyncSearchParams>({ strategy, client, abortController, logger, rule, }: {
    strategy: AsyncSearchStrategies;
    client: IScopedSearchClient;
    abortController: AbortController;
    logger: Logger;
    rule: RuleInfo;
}): AsyncSearchClient<P>;
