import type { TypeOf } from '@kbn/config-schema';
import { rawRuleTemplateSchema as rawRuleTemplateSchemaV1 } from './v1';
import { rawRuleTemplateSchema as rawRuleTemplateSchemaV2 } from './v2';
import { rawRuleTemplateSchema } from './v3';
export { rawRuleTemplateSchemaV1, rawRuleTemplateSchemaV2 };
export { rawRuleTemplateSchema as rawRuleTemplateSchemaV3 };
export type RawRuleTemplate = TypeOf<typeof rawRuleTemplateSchema>;
