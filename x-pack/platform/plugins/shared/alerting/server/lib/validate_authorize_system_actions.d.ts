import type { ActionsAuthorization, ActionsClient } from '@kbn/actions-plugin/server';
import type { ConnectorAdapterRegistry } from '../connector_adapters/connector_adapter_registry';
import type { NormalizedSystemAction } from '../rules_client';
import type { RuleSystemAction } from '../types';
interface Params {
    actionsClient: ActionsClient;
    actionsAuthorization: ActionsAuthorization;
    connectorAdapterRegistry: ConnectorAdapterRegistry;
    systemActions: Array<RuleSystemAction | NormalizedSystemAction>;
    rule: {
        consumer: string;
        producer: string;
    };
}
export declare const validateAndAuthorizeSystemActions: ({ actionsClient, connectorAdapterRegistry, actionsAuthorization, rule, systemActions, }: Params) => Promise<void>;
export {};
