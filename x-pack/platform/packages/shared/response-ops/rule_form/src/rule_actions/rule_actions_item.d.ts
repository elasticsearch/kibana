import React from 'react';
import type { RuleAction } from '@kbn/alerting-types';
export interface RuleActionsItemProps {
    action: RuleAction;
    index: number;
    producerId: string;
}
export declare const RuleActionsItem: (props: RuleActionsItemProps) => React.JSX.Element;
