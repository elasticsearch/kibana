import type { DenormalizedAction } from '../../../rules_client';
import type { AdHocRunSO } from '../../../data/ad_hoc_run/types';
import type { RuleDomain } from '../../rule/types';
import type { ScheduleBackfillParam } from '../methods/schedule/types';
export interface TransformBackfillResult {
    adHocRunSO: AdHocRunSO;
    truncated: boolean;
}
export declare const transformBackfillParamToAdHocRun: (param: ScheduleBackfillParam, rule: RuleDomain, actions: DenormalizedAction[], spaceId: string) => TransformBackfillResult;
