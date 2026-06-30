import React from 'react';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
export type RuleEventLogListKPIProps = {
    ruleId: string;
    dateStart: string;
    dateEnd: string;
    outcomeFilter?: string[];
    message?: string;
    refreshToken?: RefreshToken;
    namespaces?: Array<string | undefined>;
    filteredRuleTypes?: string[];
} & Pick<RuleApis, 'loadExecutionKPIAggregations' | 'loadGlobalExecutionKPIAggregations'>;
export declare const RuleEventLogListKPI: (props: RuleEventLogListKPIProps) => React.JSX.Element;
export declare const RuleEventLogListKPIWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    ruleId: string;
    dateStart: string;
    dateEnd: string;
    outcomeFilter?: string[];
    message?: string;
    refreshToken?: RefreshToken;
    namespaces?: Array<string | undefined>;
    filteredRuleTypes?: string[];
} & Pick<RuleApis, "loadExecutionKPIAggregations" | "loadGlobalExecutionKPIAggregations">>>;
