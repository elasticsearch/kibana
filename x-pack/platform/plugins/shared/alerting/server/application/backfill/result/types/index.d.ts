import type { TypeOf } from '@kbn/config-schema';
import type { backfillSchema, backfillScheduleSchema } from '../schemas';
export type BackfillSchedule = TypeOf<typeof backfillScheduleSchema>;
export type Backfill = TypeOf<typeof backfillSchema>;
