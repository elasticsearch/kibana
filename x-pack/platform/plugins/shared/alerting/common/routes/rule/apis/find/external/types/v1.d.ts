import type { TypeOf } from '@kbn/config-schema';
import type { findRulesRequestQuerySchemaV1, findRulesResponseSchemaV1 } from '..';
export type FindRulesRequestQuery = TypeOf<typeof findRulesRequestQuerySchemaV1>;
export type FindRulesResponse = TypeOf<typeof findRulesResponseSchemaV1>;
