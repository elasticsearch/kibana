import React from 'react';
import type { ActionVariable, RuleActionParam } from '@kbn/alerting-types';
import type { ActionConnector } from '@kbn/alerts-ui-shared';
import type { RuleUiAction } from '../common';
export interface RuleActionsMessageProps {
    action: RuleUiAction;
    index: number;
    templateFields: ActionVariable[];
    useDefaultMessage: boolean;
    connector: ActionConnector;
    producerId: string;
    warning?: string | null;
    onParamsChange: (key: string, value: RuleActionParam) => void;
    onUseAadTemplateFieldsChange?: () => void;
}
export declare const RuleActionsMessage: (props: RuleActionsMessageProps) => React.JSX.Element | null;
