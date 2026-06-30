import type { TypeOf } from '@kbn/config-schema';
import type { backfillResponseSchemaV1, errorResponseSchemaV1 } from '..';
export type BackfillResponse = TypeOf<typeof backfillResponseSchemaV1>;
export type ErrorResponse = TypeOf<typeof errorResponseSchemaV1>;
