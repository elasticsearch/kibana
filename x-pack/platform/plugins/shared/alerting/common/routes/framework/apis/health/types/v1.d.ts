import type { TypeOf } from '@kbn/config-schema';
import type { healthFrameworkResponseBodySchemaV1, healthFrameworkResponseSchemaV1 } from '..';
export type HealthFrameworkResponseBody = TypeOf<typeof healthFrameworkResponseBodySchemaV1>;
export type HealthFrameworkResponse = TypeOf<typeof healthFrameworkResponseSchemaV1>;
