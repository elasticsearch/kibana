import type { ActionTypeExecutorResult } from '@kbn/actions-plugin/common';
interface UseExecuteConnectorReturnValue {
    isLoading: boolean;
    executeConnector: (args: {
        connectorId: string;
        params: Record<string, unknown>;
    }) => Promise<ActionTypeExecutorResult<unknown> | undefined>;
}
export declare const useExecuteConnector: () => UseExecuteConnectorReturnValue;
export {};
