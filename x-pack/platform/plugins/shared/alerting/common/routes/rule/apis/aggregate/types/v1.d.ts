import type { TypeOf } from '@kbn/config-schema';
import type { aggregateRulesRequestBodySchemaV1, aggregateRulesResponseBodySchemaV1 } from '..';
export type AggregateRulesRequestBody = TypeOf<typeof aggregateRulesRequestBodySchemaV1>;
export type AggregateRulesResponseBody = TypeOf<typeof aggregateRulesResponseBodySchemaV1>;
export interface AggregateRulesResponse {
    body: AggregateRulesResponseBody;
}
