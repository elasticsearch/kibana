import type { estypes } from '@elastic/elasticsearch';
import type { AttackDiscoveryAlertDocument } from '../../../schedules/types';
/** Returns `true` if the document is missing fields required to create an `AttackDiscoveryAlert` */
export declare const isMissingRequiredFields: (hit: estypes.SearchHit<AttackDiscoveryAlertDocument>) => boolean;
