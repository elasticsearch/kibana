import type { Logger } from '@kbn/core/server';
import type { IEventLogClient, IEventLogger } from '@kbn/event-log-plugin/server';
interface SoftDeleteGapsParams {
    ruleIds: string[];
    eventLogger?: IEventLogger;
    eventLogClient: IEventLogClient;
    logger: Logger;
}
/**
 * Soft delete gaps for a given rule.
 * It orchestrates the process of searching and marking all the rule gaps as deleted
 */
export declare const softDeleteGaps: (params: SoftDeleteGapsParams) => Promise<void>;
export {};
