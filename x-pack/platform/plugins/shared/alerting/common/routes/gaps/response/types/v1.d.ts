import type { TypeOf } from '@kbn/config-schema';
import type { gapsResponseSchemaV1, errorResponseSchemaV1 } from '..';
export type GapsResponse = TypeOf<typeof gapsResponseSchemaV1>;
export type ErrorResponse = TypeOf<typeof errorResponseSchemaV1>;
