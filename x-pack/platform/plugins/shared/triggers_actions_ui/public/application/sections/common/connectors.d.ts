import type { ActionConnector, ActionTypeIndex, RuleUiAction } from '../../../types';
export declare const getValidConnectors: (connectors: ActionConnector[], actionItem: RuleUiAction, actionTypesIndex: ActionTypeIndex, allowGroupConnector?: string[]) => ActionConnector[];
