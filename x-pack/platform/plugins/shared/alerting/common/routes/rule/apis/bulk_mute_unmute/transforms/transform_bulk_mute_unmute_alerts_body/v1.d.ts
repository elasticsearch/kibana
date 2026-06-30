import type { BulkMuteUnmuteAlertsParams } from '../../../../../../../server/application/rule/types';
import type { BulkMuteUnmuteAlertsRequestBodyV1 } from '../..';
export declare const transformBulkMuteUnmuteAlertsBody: (body: BulkMuteUnmuteAlertsRequestBodyV1) => BulkMuteUnmuteAlertsParams["rules"];
