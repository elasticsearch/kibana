import type { RuleTypeParams, SanitizedRule } from '@kbn/alerting-types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
interface ClearExpiredSnoozesOpts {
    esClient: ElasticsearchClient;
    logger: Logger;
    rule: Pick<SanitizedRule<RuleTypeParams>, 'id' | 'snoozeSchedule'>;
    version?: string;
}
export declare function clearExpiredSnoozes(opts: ClearExpiredSnoozesOpts): Promise<void>;
export {};
