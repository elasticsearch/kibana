import type { LocatorDefinition } from '@kbn/share-plugin/public';
import { type RuleDetailsLocatorParams } from '@kbn/rule-data-utils';
export declare const getRuleDetailsPath: (ruleId: string) => string;
export declare class RuleDetailsLocatorDefinition implements LocatorDefinition<RuleDetailsLocatorParams> {
    readonly id = "RULE_DETAILS_LOCATOR";
    readonly getLocation: (params: RuleDetailsLocatorParams) => Promise<{
        app: string;
        path: string;
        state: {};
    }>;
}
