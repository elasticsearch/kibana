import React from 'react';
import type { RefreshToken } from './types';
export type RuleEventLogListOptions = 'stackManagement' | 'default';
export interface RuleEventLogListCommonProps {
    ruleId: string;
    localStorageKey?: string;
    refreshToken?: RefreshToken;
    initialPageSize?: number;
    hasRuleNames?: boolean;
    hasAllSpaceSwitch?: boolean;
    filteredRuleTypes?: string[];
    getRuleDetailsRoute?: (ruleId: string) => string;
}
export type RuleEventLogListTableProps<T extends RuleEventLogListOptions = 'default'> = T extends 'default' ? RuleEventLogListCommonProps : T extends 'stackManagement' ? RuleEventLogListCommonProps : never;
export declare const RuleEventLogListTable: <T extends RuleEventLogListOptions>(props: RuleEventLogListTableProps<T>) => React.JSX.Element;
export { RuleEventLogListTable as default };
