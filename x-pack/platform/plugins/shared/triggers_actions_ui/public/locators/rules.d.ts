import type { LocatorDefinition } from '@kbn/share-plugin/public';
import { type RulesLocatorParams } from '@kbn/rule-data-utils';
export declare class RulesLocatorDefinition implements LocatorDefinition<RulesLocatorParams> {
    readonly id = "RULES_LOCATOR";
    readonly getLocation: ({ lastResponse, params, search, status, type, }: RulesLocatorParams) => Promise<{
        app: string;
        path: string;
        state: {};
    }>;
}
