import type { ConnectorAdapterRegistry } from './connector_adapter_registry';
interface ValidateSchemaArgs {
    connectorAdapterRegistry: ConnectorAdapterRegistry;
    connectorTypeId?: string;
    params: Record<string, unknown>;
}
interface BulkValidateSchemaArgs {
    connectorAdapterRegistry: ConnectorAdapterRegistry;
    actions: Array<{
        actionTypeId: string;
        params: Record<string, unknown>;
    }>;
}
export declare const validateConnectorAdapterActionParams: ({ connectorAdapterRegistry, connectorTypeId, params, }: ValidateSchemaArgs) => void;
export declare const bulkValidateConnectorAdapterActionParams: ({ connectorAdapterRegistry, actions, }: BulkValidateSchemaArgs) => void;
export {};
