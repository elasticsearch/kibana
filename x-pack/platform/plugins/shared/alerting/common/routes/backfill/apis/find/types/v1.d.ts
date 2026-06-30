import type { TypeOf } from '@kbn/config-schema';
import type { findQuerySchemaV1, findResponseSchemaV1 } from '..';
export type FindBackfillRequestQuery = TypeOf<typeof findQuerySchemaV1>;
export type FindBackfillResponseBody = TypeOf<typeof findResponseSchemaV1>;
export interface FindBackfillResponse {
    body: FindBackfillResponseBody;
}
