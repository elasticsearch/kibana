import type { RuleActionParams } from '../types';
import type { RuleUrl } from './action_scheduler';
export interface InjectActionParamsOpts {
    actionTypeId: string;
    actionParams: RuleActionParams;
    ruleUrl?: RuleUrl;
    ruleName?: string;
}
export declare function injectActionParams({ actionTypeId, actionParams, ruleName, ruleUrl, }: InjectActionParamsOpts): import("@kbn/core/server").SavedObjectAttributes | {
    kibanaFooterLink: {
        path: string;
        text: string;
    };
};
