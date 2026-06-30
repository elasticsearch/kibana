import type { TypeOf } from '@kbn/config-schema';
import type { scheduleRequestSchemaV1, scheduleResponseSchemaV1 } from '..';
export type ScheduleRequest = TypeOf<typeof scheduleRequestSchemaV1>;
export type ScheduleResponse = TypeOf<typeof scheduleResponseSchemaV1>;
