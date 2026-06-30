import type { TypeOf } from '@kbn/config-schema';
import type { scheduleBackfillErrorSchema, scheduleBackfillParamSchema, scheduleBackfillParamsSchema, scheduleBackfillResultSchema, scheduleBackfillResultsSchema } from '../schemas';
export type ScheduleBackfillParam = TypeOf<typeof scheduleBackfillParamSchema>;
export type ScheduleBackfillParams = TypeOf<typeof scheduleBackfillParamsSchema>;
export type ScheduleBackfillResult = TypeOf<typeof scheduleBackfillResultSchema>;
export type ScheduleBackfillResults = TypeOf<typeof scheduleBackfillResultsSchema>;
export type ScheduleBackfillError = TypeOf<typeof scheduleBackfillErrorSchema>;
