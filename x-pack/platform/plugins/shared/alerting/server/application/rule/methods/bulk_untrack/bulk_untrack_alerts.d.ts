import type { BulkUntrackBody } from './types';
import type { RulesClientContext } from '../../../../rules_client/types';
export type { BulkUntrackBody };
export declare function bulkUntrackAlerts(context: RulesClientContext, params: BulkUntrackBody): Promise<void>;
