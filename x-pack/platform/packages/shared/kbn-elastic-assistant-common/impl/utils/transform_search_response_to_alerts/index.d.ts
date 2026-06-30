import type { estypes } from '@elastic/elasticsearch';
import type { Logger } from '@kbn/core/server';
import type { AttackDiscoveryApiAlert } from '../../schemas';
import type { AttackDiscoveryAlertDocument } from '../../schedules/types';
interface TransformSearchResponseToAlerts {
    connectorNames: string[];
    data: AttackDiscoveryApiAlert[];
    uniqueAlertIdsCount: number;
    uniqueAlertIds: string[];
}
export declare const transformSearchResponseToAlerts: ({ enableFieldRendering, includeUniqueAlertIds, logger, response, withReplacements, }: {
    enableFieldRendering: boolean;
    includeUniqueAlertIds?: boolean;
    logger: Logger;
    response: estypes.SearchResponse<AttackDiscoveryAlertDocument>;
    withReplacements: boolean;
}) => TransformSearchResponseToAlerts;
export {};
