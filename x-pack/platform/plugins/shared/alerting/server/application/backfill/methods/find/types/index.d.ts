import type { TypeOf } from '@kbn/config-schema';
import type { findBackfillQuerySchema, findBackfillResultSchema } from '../schemas';
export type FindBackfillParams = TypeOf<typeof findBackfillQuerySchema>;
export type FindBackfillResult = TypeOf<typeof findBackfillResultSchema>;
