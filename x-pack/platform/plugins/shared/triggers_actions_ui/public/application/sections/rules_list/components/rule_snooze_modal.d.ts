import React from 'react';
import type { Rule, RuleTypeParams } from '../../../../types';
export interface RuleSnoozeModalProps {
    rule: Rule<RuleTypeParams>;
    onClose: () => void;
    onLoading: (isLoading: boolean) => void;
    onRuleChanged: () => void;
}
export declare const RuleSnoozeModal: React.FunctionComponent<RuleSnoozeModalProps>;
export { RuleSnoozeModal as default };
