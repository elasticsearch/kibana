import type { SavedObjectReference, SavedObjectAttributes } from '@kbn/core/server';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import type { RawRule, RuleTypeParams } from '../../types';
import type { RuleDomain } from '../../application/rule/types';
export declare function injectReferencesIntoActions(alertId: string, actions: RawRule['actions'], references: SavedObjectReference[]): {
    id: string;
    group?: string | undefined;
    params: {
        [x: string]: any;
    };
    uuid: string;
    actionTypeId: string;
    frequency?: Readonly<{} & {
        summary: boolean;
        throttle: string | null;
        notifyWhen: "onActionGroupChange" | "onActiveAlert" | "onThrottleInterval";
    }> | undefined;
    alertsFilter?: Readonly<{
        query?: Readonly<{} & {
            kql: string;
            filters: Readonly<{
                query?: Record<string, any> | undefined;
                $state?: Readonly<{} & {
                    store: import("@kbn/es-query-constants").FilterStateStore;
                }> | undefined;
            } & {
                meta: Readonly<{
                    type?: string | undefined;
                    key?: string | undefined;
                    disabled?: boolean | undefined;
                    value?: string | undefined;
                    group?: string | undefined;
                    index?: string | undefined;
                    params?: any;
                    field?: string | undefined;
                    alias?: string | null | undefined;
                    negate?: boolean | undefined;
                    controlledBy?: string | undefined;
                    isMultiIndex?: boolean | undefined;
                    relation?: "AND" | "OR" | undefined;
                } & {}>;
            }>[];
            dsl: string;
        }> | undefined;
        timeframe?: Readonly<{} & {
            timezone: string;
            days: (2 | 4 | 1 | 6 | 5 | 3 | 7)[];
            hours: Readonly<{} & {
                end: string;
                start: string;
            }>;
        }> | undefined;
    } & {}> | undefined;
    useAlertDataForTemplate?: boolean | undefined;
}[];
export declare function injectReferencesIntoParams<Params extends RuleTypeParams, ExtractedParams extends RuleTypeParams>(ruleId: string, ruleType: UntypedNormalizedRuleType, ruleParams: SavedObjectAttributes | undefined, references: SavedObjectReference[]): Params;
export declare function injectReferencesIntoArtifacts(ruleId: string, artifacts?: RawRule['artifacts'], references?: SavedObjectReference[]): Required<RuleDomain['artifacts']>;
