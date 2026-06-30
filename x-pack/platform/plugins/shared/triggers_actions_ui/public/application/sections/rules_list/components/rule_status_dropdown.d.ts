import React from 'react';
import type { Rule, SnoozeSchedule, BulkOperationResponse } from '../../../../types';
type DropdownRuleRecord = Pick<Rule, 'enabled' | 'muteAll' | 'isSnoozedUntil' | 'snoozeSchedule' | 'activeSnoozes'> & Partial<Pick<Rule, 'ruleTypeId'>>;
export interface ComponentOpts {
    rule: DropdownRuleRecord;
    onRuleChanged: () => void;
    enableRule: () => Promise<BulkOperationResponse>;
    disableRule: (untrack: boolean) => Promise<BulkOperationResponse>;
    snoozeRule: (snoozeSchedule: SnoozeSchedule) => Promise<void>;
    unsnoozeRule: (scheduleIds?: string[]) => Promise<void>;
    isEditable: boolean;
    direction?: 'column' | 'row';
    hideSnoozeOption?: boolean;
    autoRecoverAlerts?: boolean;
}
export declare const RuleStatusDropdown: React.FunctionComponent<ComponentOpts>;
export declare const futureTimeToInterval: (time?: Date | null) => string | undefined;
export { RuleStatusDropdown as default };
