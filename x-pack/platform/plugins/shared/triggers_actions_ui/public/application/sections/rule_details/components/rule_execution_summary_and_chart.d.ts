import React from 'react';
import type { RuleSummary, RuleType } from '../../../../types';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
export declare const DEFAULT_NUMBER_OF_EXECUTIONS = 60;
type RuleExecutionSummaryAndChartProps = {
    ruleId: string;
    ruleType: RuleType;
    ruleSummary?: RuleSummary;
    numberOfExecutions?: number;
    isLoadingRuleSummary?: boolean;
    refreshToken?: RefreshToken;
    onChangeDuration?: (duration: number) => void;
    requestRefresh?: () => Promise<void>;
    fetchRuleSummary?: boolean;
} & Pick<RuleApis, 'loadRuleSummary'>;
export declare const RuleExecutionSummaryAndChart: (props: RuleExecutionSummaryAndChartProps) => React.JSX.Element;
export declare const RuleExecutionSummaryAndChartWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    ruleId: string;
    ruleType: RuleType;
    ruleSummary?: RuleSummary;
    numberOfExecutions?: number;
    isLoadingRuleSummary?: boolean;
    refreshToken?: RefreshToken;
    onChangeDuration?: (duration: number) => void;
    requestRefresh?: () => Promise<void>;
    fetchRuleSummary?: boolean;
} & Pick<RuleApis, "loadRuleSummary">>>;
export {};
