import React from 'react';
import { getOutcomeHealthColor } from '../../../../common/lib';
interface RuleLastRunOutcomeFilterProps {
    selectedOutcomes: string[];
    onChange?: (selectedRuleOutcomeIds: string[]) => void;
}
export declare const RuleLastRunOutcomeFilter: React.FunctionComponent<RuleLastRunOutcomeFilterProps>;
export { getOutcomeHealthColor as getHealthColor };
