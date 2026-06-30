import type { ConnectorAdapter, ConnectorAdapterParams } from './types';
export declare class ConnectorAdapterRegistry {
    private readonly connectorAdapters;
    has(connectorTypeId: string): boolean;
    register<RuleActionParams extends ConnectorAdapterParams = ConnectorAdapterParams, ConnectorParams extends ConnectorAdapterParams = ConnectorAdapterParams>(connectorAdapter: ConnectorAdapter<RuleActionParams, ConnectorParams>): void;
    get(connectorTypeId: string): ConnectorAdapter;
}
