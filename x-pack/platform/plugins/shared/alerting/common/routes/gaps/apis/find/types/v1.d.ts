import type { TypeOf } from '@kbn/config-schema';
import type { findGapsBodySchemaV1, findGapsResponseSchemaV1 } from '..';
export type FindGapsRequestBody = TypeOf<typeof findGapsBodySchemaV1>;
export type FindGapsResponseBody = TypeOf<typeof findGapsResponseSchemaV1>;
export interface FindGapsResponse {
    body: FindGapsResponseBody;
}
