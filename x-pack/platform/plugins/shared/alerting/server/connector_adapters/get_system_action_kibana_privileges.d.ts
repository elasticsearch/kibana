import type { RuleSystemAction } from '../types';
import type { ConnectorAdapterRegistry } from './connector_adapter_registry';
interface Args {
    connectorAdapterRegistry: ConnectorAdapterRegistry;
    rule: {
        consumer: string;
        producer: string;
    };
    systemActions?: RuleSystemAction[];
}
export declare const getSystemActionKibanaPrivileges: ({ connectorAdapterRegistry, systemActions, rule, }: Args) => string[];
export {};
