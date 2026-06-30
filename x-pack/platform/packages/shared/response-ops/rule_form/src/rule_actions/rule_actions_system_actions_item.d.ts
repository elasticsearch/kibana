import type { RuleSystemAction } from '@kbn/alerting-types';
import React from 'react';
interface RuleActionsSystemActionsItemProps {
    action: RuleSystemAction;
    index: number;
    producerId: string;
}
export declare const RuleActionsSystemActionsItem: (props: RuleActionsSystemActionsItemProps) => React.JSX.Element;
export {};
