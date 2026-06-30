import type { TypeOf } from '@kbn/config-schema';
import type { scheduleBodySchemaV1, scheduleResponseSchemaV1 } from '..';
export type ScheduleBackfillRequestBody = TypeOf<typeof scheduleBodySchemaV1>;
export type ScheduleBackfillResponseBody = TypeOf<typeof scheduleResponseSchemaV1>;
export interface ScheduleBackfillResponse {
    body: ScheduleBackfillResponseBody;
}
