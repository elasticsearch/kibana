import type { Gap } from '../../../../lib/rule_gaps/gap';
import type { RulesClientContext } from '../../../../rules_client';
import type { ScheduleBackfillParams, ScheduleBackfillResults } from './types';
export declare function scheduleBackfill(context: RulesClientContext, params: ScheduleBackfillParams, gaps?: Gap[]): Promise<ScheduleBackfillResults>;
