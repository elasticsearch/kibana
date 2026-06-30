import type { SavedObjectsBulkResponse } from '@kbn/core-saved-objects-api-server';
import type { RawRule } from '../../../../../saved_objects/schemas/raw_rule';
import type { BulkMuteUnmuteAlertsParams } from '../../../types';
export declare const transformUnmuteRequestToRuleAttributes: ({ paramRules, savedRules, }: {
    paramRules: BulkMuteUnmuteAlertsParams["rules"];
    savedRules: SavedObjectsBulkResponse<RawRule>["saved_objects"];
}) => {
    id: string;
    attributes: Partial<RawRule>;
}[];
