import type { TypeOf } from '@kbn/config-schema';
import type { runSoonRequestParamsSchemaV1, runSoonRequestQuerySchemaV1 } from '..';
export type RunSoonRequestParams = TypeOf<typeof runSoonRequestParamsSchemaV1>;
export type RunSoonRequestQuery = TypeOf<typeof runSoonRequestQuerySchemaV1>;
