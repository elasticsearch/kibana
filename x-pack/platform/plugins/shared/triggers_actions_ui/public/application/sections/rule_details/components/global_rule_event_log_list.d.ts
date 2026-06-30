import React from 'react';
import type { RuleEventLogListCommonProps } from './rule_event_log_list_table';
export interface GlobalRuleEventLogListProps {
    localStorageKey?: RuleEventLogListCommonProps['localStorageKey'];
    filteredRuleTypes?: RuleEventLogListCommonProps['filteredRuleTypes'];
    getRuleDetailsRoute?: RuleEventLogListCommonProps['getRuleDetailsRoute'];
}
export declare const GlobalRuleEventLogList: (props: GlobalRuleEventLogListProps) => React.JSX.Element;
export { GlobalRuleEventLogList as default };
