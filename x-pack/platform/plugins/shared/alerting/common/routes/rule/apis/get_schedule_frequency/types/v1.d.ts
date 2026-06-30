import type { TypeOf } from '@kbn/config-schema';
import type { getScheduleFrequencyResponseSchemaV1, getScheduleFrequencyResponseBodySchemaV1 } from '..';
export type GetScheduleFrequencyResponseBody = TypeOf<typeof getScheduleFrequencyResponseBodySchemaV1>;
export type GetScheduleFrequencyResponse = TypeOf<typeof getScheduleFrequencyResponseSchemaV1>;
