import type { Rule, RuleTypeParams } from '../../types';
export interface UpdateRuleBody<Params extends RuleTypeParams = RuleTypeParams> {
    name: Rule<Params>['name'];
    tags: Rule<Params>['tags'];
    schedule: Rule<Params>['schedule'];
    params: Rule<Params>['params'];
    actions: Rule<Params>['actions'];
    throttle?: Rule<Params>['throttle'];
    notifyWhen?: Rule<Params>['notifyWhen'];
    alertDelay?: Rule<Params>['alertDelay'];
    flapping?: Rule<Params>['flapping'];
    artifacts?: Rule<Params>['artifacts'];
}
