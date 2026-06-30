import type { SavedObjectsBulkResponse } from '@kbn/core-saved-objects-api-server';
import type { BulkUpdateRuleSoParams } from '../../../data/rule';
import type { RawRule } from '../../../saved_objects/schemas/raw_rule';
import type { BulkMuteUnmuteAlertsParams } from '../types';
type InstanceIdCalculator = ({ existingInstanceIds, instanceIdsFromRequest, }: {
    existingInstanceIds: string[];
    instanceIdsFromRequest: string[];
}) => Pick<RawRule, 'mutedInstanceIds' | 'updatedAt'> | undefined;
export declare const transformMuteUnmuteRequestToRuleAttributes: ({ paramRules, savedRules, instanceIdCalculator, }: {
    paramRules: BulkMuteUnmuteAlertsParams["rules"];
    savedRules: SavedObjectsBulkResponse<RawRule>["saved_objects"];
    instanceIdCalculator: InstanceIdCalculator;
}) => BulkUpdateRuleSoParams["rules"];
export {};
