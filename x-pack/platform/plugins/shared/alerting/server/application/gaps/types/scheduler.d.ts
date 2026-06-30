import type { TypeOf } from '@kbn/config-schema';
import type { rawGapAutoFillSchedulerSchemaV2 } from '../../../saved_objects/schemas/raw_gap_auto_fill_scheduler/v2';
export type SchedulerSoAttributes = TypeOf<typeof rawGapAutoFillSchedulerSchemaV2>;
export declare const GAP_AUTO_FILL_SCHEDULER_TASK_TYPE: "gap-auto-fill-scheduler-task";
export declare const DEFAULT_RULES_BATCH_SIZE = 10;
export declare const DEFAULT_GAPS_PER_PAGE: number;
export declare const DEFAULT_GAP_AUTO_FILL_SCHEDULER_TIMEOUT: "60s";
export type GapAutoFillSchedulerLogConfig = Pick<SchedulerSoAttributes, 'name' | 'numRetries' | 'gapFillRange' | 'schedule' | 'maxBackfills' | 'ruleTypes' | 'excludedReasons'>;
