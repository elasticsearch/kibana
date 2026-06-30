import type { Rule, RuleTypeParams } from '../../types';
export interface CreateRuleBody<Params extends RuleTypeParams = RuleTypeParams> {
    name: Rule<Params>['name'];
    ruleTypeId: Rule<Params>['ruleTypeId'];
    enabled: Rule<Params>['enabled'];
    consumer: Rule<Params>['consumer'];
    tags: Rule<Params>['tags'];
    params: Rule<Params>['params'];
    schedule: Rule<Params>['schedule'];
    actions: Rule<Params>['actions'];
    throttle?: Rule<Params>['throttle'];
    notifyWhen?: Rule<Params>['notifyWhen'];
    alertDelay?: Rule<Params>['alertDelay'];
    flapping?: Rule<Params>['flapping'];
    artifacts?: Rule<Params>['artifacts'];
}
