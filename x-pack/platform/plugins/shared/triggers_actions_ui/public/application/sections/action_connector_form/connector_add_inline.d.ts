import React from 'react';
import type { RuleUiAction, ActionTypeIndex, ActionConnector } from '../../../types';
import type { ActionAccordionFormProps } from './action_form';
export type AddConnectorInFormProps = {
    actionTypesIndex: ActionTypeIndex;
    actionItem: RuleUiAction;
    connectors: ActionConnector[];
    index: number;
    onAddConnector: () => void;
    onDeleteConnector: () => void;
    onSelectConnector: (connectorId: string) => void;
    emptyActionsIds: string[];
} & Pick<ActionAccordionFormProps, 'actionTypeRegistry'>;
export declare const AddConnectorInline: ({ actionTypesIndex, actionItem, index, connectors, onAddConnector, onDeleteConnector, onSelectConnector, actionTypeRegistry, emptyActionsIds, }: AddConnectorInFormProps) => React.JSX.Element;
export { AddConnectorInline as default };
