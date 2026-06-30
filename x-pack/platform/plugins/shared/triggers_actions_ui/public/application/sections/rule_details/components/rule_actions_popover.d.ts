import React from 'react';
import type { Rule } from '../../../..';
export interface RuleActionsPopoverProps {
    rule: Rule;
    onDelete: (ruleId: string) => void;
    onApiKeyUpdate: (ruleId: string) => void;
    onEnableDisable: (enable: boolean) => void;
    onSnooze: () => void;
    onRunRule: (ruleId: string) => void;
    onEdit: (ruleId: string) => void;
    canEdit: boolean;
    isEditDisabled: boolean;
    isInternallyManaged: boolean;
}
export declare const RuleActionsPopover: React.FunctionComponent<RuleActionsPopoverProps>;
