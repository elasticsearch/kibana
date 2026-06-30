import React from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import type { ToastsApi } from '@kbn/core/public';
import type { RuleType, ActionType, ResolvedRule } from '../../../../types';
import type { ComponentOpts as RuleApis } from '../../common/components/with_bulk_rule_api_operations';
import type { ComponentOpts as ActionApis } from '../../common/components/with_actions_api_operations';
type RuleDetailsRouteProps = RouteComponentProps<{
    ruleId: string;
}> & Pick<ActionApis, 'loadActionTypes'> & Pick<RuleApis, 'loadRuleTypes' | 'resolveRule'>;
export declare const RuleDetailsRoute: React.FunctionComponent<RuleDetailsRouteProps>;
export declare function getRuleData(ruleId: string, loadRuleTypes: RuleApis['loadRuleTypes'], resolveRule: RuleApis['resolveRule'], loadActionTypes: ActionApis['loadActionTypes'], setRule: React.Dispatch<React.SetStateAction<ResolvedRule | null>>, setRuleType: React.Dispatch<React.SetStateAction<RuleType | null>>, setActionTypes: React.Dispatch<React.SetStateAction<ActionType[] | null>>, toasts: Pick<ToastsApi, 'addDanger'>): Promise<void>;
declare const RuleDetailsRouteWithApi: React.FunctionComponent<import("../../common/components/with_actions_api_operations").PropsWithOptionalApiHandlers<Omit<RouteComponentProps<{
    ruleId: string;
}, import("react-router").StaticContext, unknown> & Pick<ActionApis, "loadActionTypes"> & Pick<RuleApis, "loadRuleTypes" | "resolveRule">, keyof RuleApis> & Partial<RuleApis>>>;
export { RuleDetailsRouteWithApi as default };
