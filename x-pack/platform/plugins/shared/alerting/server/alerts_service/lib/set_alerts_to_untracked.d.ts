import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { Logger } from '@kbn/logging';
import { ALERT_RULE_UUID, ALERT_UUID } from '@kbn/rule-data-utils';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { RulesClientContext } from '../../rules_client';
export type BulkEnsureAuthorizedForUntrack = (opts: {
    ruleTypeIdConsumersPairs: Array<{
        ruleTypeId: string;
        consumers: string[];
    }>;
}) => Promise<unknown>;
export interface SetAlertsToUntrackedParams {
    indices?: string[];
    ruleIds?: string[];
    alertUuids?: string[];
    query?: QueryDslQueryContainer[];
    spaceId?: RulesClientContext['spaceId'];
    ruleTypeIds?: string[];
    isUsingQuery?: boolean;
    getAllAuthorizedRuleTypesFindOperation?: RulesClientContext['authorization']['getAllAuthorizedRuleTypesFindOperation'];
    getAlertIndicesAlias?: RulesClientContext['getAlertIndicesAlias'];
    bulkEnsureAuthorized?: BulkEnsureAuthorizedForUntrack;
}
interface SetAlertsToUntrackedParamsWithDep extends SetAlertsToUntrackedParams {
    logger: Logger;
    esClient: ElasticsearchClient;
}
type UntrackedAlertsResult = Array<{
    [ALERT_RULE_UUID]: string;
    [ALERT_UUID]: string;
}>;
export declare function setAlertsToUntracked(params: SetAlertsToUntrackedParamsWithDep): Promise<UntrackedAlertsResult>;
export {};
