import React from 'react';
import type { ActionConnector, ActionTypeIndex, ActionTypeModel, RuleUiAction } from '../../../types';
interface SelectionProps {
    allowGroupConnector?: string[];
    actionItem: RuleUiAction;
    accordionIndex: number;
    actionTypesIndex: ActionTypeIndex;
    actionTypeRegistered: ActionTypeModel;
    connectors: ActionConnector[];
    onConnectorSelected: (id: string) => void;
}
export declare const ConnectorsSelection: React.MemoExoticComponent<typeof ConnectorsSelectionComponent>;
declare function ConnectorsSelectionComponent({ allowGroupConnector, actionItem, accordionIndex, actionTypesIndex, actionTypeRegistered, connectors, onConnectorSelected, }: SelectionProps): React.JSX.Element;
export {};
