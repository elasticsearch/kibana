import type { TypeOf } from '@kbn/config-schema';
import type { snoozeParamsSchemaV1, snoozeBodySchemaV1, snoozeResponseSchemaV1 } from '../..';
export type SnoozeParams = TypeOf<typeof snoozeParamsSchemaV1>;
export type SnoozeBody = TypeOf<typeof snoozeBodySchemaV1>;
export type SnoozeResponse = TypeOf<typeof snoozeResponseSchemaV1>;
