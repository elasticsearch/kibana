import type { KueryNode } from '@kbn/es-query';
import type * as estypes from '@elastic/elasticsearch/lib/api/types';
import type { AuthorizedRuleTypes } from './alerting_authorization';
export declare enum AlertingAuthorizationFilterType {
    KQL = "kql",
    ESDSL = "dsl"
}
export interface AlertingAuthorizationFilterOpts {
    type: AlertingAuthorizationFilterType;
    fieldNames: AlertingAuthorizationFilterFieldNames;
}
export interface AlertingAuthorizationFilterOptsBySpaceId {
    type: AlertingAuthorizationFilterType;
    fieldNames: Pick<AlertingAuthorizationFilterFieldNames, 'spaceIds'>;
}
interface AlertingAuthorizationFilterFieldNames {
    ruleTypeId: string;
    consumer?: string;
    spaceIds?: string;
}
export declare function asFiltersByRuleTypeAndConsumer(ruleTypes: AuthorizedRuleTypes, opts: AlertingAuthorizationFilterOpts, spaceId: string | undefined): KueryNode | estypes.QueryDslQueryContainer;
export declare function asFiltersBySpaceId(opts: AlertingAuthorizationFilterOptsBySpaceId, spaceId: string | undefined): KueryNode | estypes.QueryDslQueryContainer | undefined;
export declare function ensureFieldIsSafeForQuery(field: string, value: string): boolean;
export {};
