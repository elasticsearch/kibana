import React from 'react';
import { getExecutionStatusHealthColor } from '../../../../common/lib';
interface RuleExecutionStatusFilterProps {
    selectedStatuses: string[];
    onChange?: (selectedRuleStatusesIds: string[]) => void;
}
export declare const RuleExecutionStatusFilter: React.FunctionComponent<RuleExecutionStatusFilterProps>;
export { getExecutionStatusHealthColor as getHealthColor };
