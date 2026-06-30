import type { TypeOf } from '@kbn/config-schema';
import type { findGapsParamsSchema, findGapsByIdParamsSchema, findGapsSearchAfterParamsSchema } from '../schemas';
export type FindGapsParams = TypeOf<typeof findGapsParamsSchema>;
export type FindGapsSearchAfterParams = TypeOf<typeof findGapsSearchAfterParamsSchema>;
export type FindGapsByIdParams = TypeOf<typeof findGapsByIdParamsSchema>;
