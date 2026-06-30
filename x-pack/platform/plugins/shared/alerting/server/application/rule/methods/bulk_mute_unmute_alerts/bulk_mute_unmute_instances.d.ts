import type { BulkMuteUnmuteAlertsParams } from '../../types';
import type { RulesClientContext } from '../../../../rules_client/types';
interface BulkMuteUnmuteArgs {
    params: BulkMuteUnmuteAlertsParams;
    mute: boolean;
}
export declare function bulkMuteUnmuteInstances(context: RulesClientContext, { params, mute }: BulkMuteUnmuteArgs): Promise<void>;
export {};
