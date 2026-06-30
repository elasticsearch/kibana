import React from 'react';
import type { RuleActionParam } from '@kbn/alerting-plugin/common';
import type { RuleSystemAction, ActionTypeIndex, ActionConnector, ActionTypeRegistryContract } from '../../../types';
import type { ActionAccordionFormProps } from './action_form';
export type SystemActionTypeFormProps = {
    actionItem: RuleSystemAction;
    actionConnector: ActionConnector;
    index: number;
    onDeleteAction: () => void;
    setActionParamsProperty: (key: string, value: RuleActionParam, index: number) => void;
    actionTypesIndex: ActionTypeIndex;
    connectors: ActionConnector[];
    actionTypeRegistry: ActionTypeRegistryContract;
    featureId: string;
    producerId: string;
    ruleTypeId?: string;
    disableErrorMessages?: boolean;
} & Pick<ActionAccordionFormProps, 'setActionParamsProperty' | 'messageVariables' | 'summaryMessageVariables' | 'defaultActionMessage' | 'defaultSummaryMessage'>;
export declare const SystemActionTypeForm: ({ actionItem, actionConnector, index, onDeleteAction, setActionParamsProperty, actionTypesIndex, connectors, defaultActionMessage, messageVariables, summaryMessageVariables, actionTypeRegistry, defaultSummaryMessage, producerId, featureId, ruleTypeId, disableErrorMessages, }: SystemActionTypeFormProps) => React.JSX.Element | null;
