import type { ActionConnector, ActionConnectorWithoutId } from '../../types';
type UpdateConnectorSchema = Pick<ActionConnectorWithoutId, 'name' | 'config' | 'secrets'> & {
    id: string;
};
interface UseUpdateConnectorReturnValue {
    isLoading: boolean;
    updateConnector: (connector: UpdateConnectorSchema) => Promise<ActionConnector | undefined>;
}
export declare const useUpdateConnector: () => UseUpdateConnectorReturnValue;
export {};
