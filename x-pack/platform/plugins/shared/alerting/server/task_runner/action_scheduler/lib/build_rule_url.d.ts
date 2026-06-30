import type { Logger } from '@kbn/logging';
import type { RuleTypeParams } from '@kbn/alerting-types';
import type { GetViewInAppRelativeUrlFn } from '../../../types';
import type { ActionSchedulerRule } from '../types';
interface BuildRuleUrlOpts<Params extends RuleTypeParams> {
    end?: number;
    getViewInAppRelativeUrl?: GetViewInAppRelativeUrlFn<Params>;
    kibanaBaseUrl: string | undefined;
    logger: Logger;
    rule: ActionSchedulerRule<Params>;
    spaceId: string;
    start?: number;
}
interface BuildRuleUrlResult {
    absoluteUrl: string;
    basePathname: string;
    kibanaBaseUrl: string;
    relativePath: string;
    spaceIdSegment: string;
}
export declare const buildRuleUrl: <Params extends RuleTypeParams>(opts: BuildRuleUrlOpts<Params>) => BuildRuleUrlResult | undefined;
export {};
