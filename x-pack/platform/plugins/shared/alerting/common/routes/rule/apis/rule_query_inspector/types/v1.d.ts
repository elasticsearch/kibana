import type { TypeOf } from '@kbn/config-schema';
import type { ruleQueryInspectorParamsSchemaV1, ruleQueryInspectorQuerySchemaV1, ruleQueryInspectorResponseSchemaV1 } from '..';
export type RuleQueryInspectorRequestParams = TypeOf<typeof ruleQueryInspectorParamsSchemaV1>;
export type RuleQueryInspectorRequestQuery = TypeOf<typeof ruleQueryInspectorQuerySchemaV1>;
export type RuleQueryInspectorResponseBody = TypeOf<typeof ruleQueryInspectorResponseSchemaV1>;
export interface RuleQueryInspectorResponse {
    body: RuleQueryInspectorResponseBody;
}
