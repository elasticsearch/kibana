import type { AttackDiscoveryApiAlert } from '../../../schemas';
import type { AttackDiscoveryAlertDocument } from '../../../schedules/types';
export declare const transformAttackDiscoveryAlertDocumentToApi: ({ attackDiscoveryAlertDocument, enableFieldRendering, id, index, withReplacements, }: {
    attackDiscoveryAlertDocument: AttackDiscoveryAlertDocument;
    enableFieldRendering: boolean;
    id: string;
    index?: string;
    withReplacements: boolean;
}) => AttackDiscoveryApiAlert;
