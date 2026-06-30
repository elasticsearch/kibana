import type { HttpSetup } from '@kbn/core/public';
import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
export declare function executeAction<R>({ id, params, http, signal, }: {
    id: string;
    http: HttpSetup;
    params: Record<string, unknown>;
    signal?: AbortSignal;
}): Promise<ActionTypeExecutorResult<R>>;
