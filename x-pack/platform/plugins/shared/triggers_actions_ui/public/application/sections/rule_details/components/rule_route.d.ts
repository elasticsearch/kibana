import type { ToastsApi } from '@kbn/core/public';
import React from 'react';
import type { Rule, RuleSummary, RuleType } from '../../../../types';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { RefreshToken } from './types';
type WithRuleSummaryProps = {
    rule: Rule;
    ruleType: RuleType;
    readOnly: boolean;
    requestRefresh: () => Promise<void>;
    refreshToken?: RefreshToken;
} & Pick<RuleApis, 'loadRuleSummary'>;
export declare const RuleRoute: React.FunctionComponent<WithRuleSummaryProps>;
export declare function getRuleSummary(ruleId: string, loadRuleSummary: RuleApis['loadRuleSummary'], setRuleSummary: React.Dispatch<React.SetStateAction<RuleSummary | null>>, toasts: Pick<ToastsApi, 'addDanger'>, executionDuration?: number): Promise<void>;
export declare const RuleRouteWithApi: React.FunctionComponent<import("../../common/components/with_bulk_rule_api_operations").PropsWithOptionalApiHandlers<{
    rule: Rule;
    ruleType: RuleType;
    readOnly: boolean;
    requestRefresh: () => Promise<void>;
    refreshToken?: RefreshToken;
} & Pick<RuleApis, "loadRuleSummary">>>;
export {};
