import type { TypeOf } from '@kbn/config-schema';
import type { getParamsSchemaV1, getResponseSchemaV1 } from '..';
export type GetBackfillRequestParams = TypeOf<typeof getParamsSchemaV1>;
export type GetBackfillResponseBody = TypeOf<typeof getResponseSchemaV1>;
export interface GetBackfillResponse {
    body: GetBackfillResponseBody;
}
