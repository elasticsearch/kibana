import type { RewriteRequestCase } from '@kbn/actions-types';
import type { ResolvedRule, Rule, RuleTemplate } from '..';
export declare const transformRule: RewriteRequestCase<Rule>;
export declare const transformResolvedRule: RewriteRequestCase<ResolvedRule>;
export declare const transformRuleTemplate: RewriteRequestCase<RuleTemplate>;
