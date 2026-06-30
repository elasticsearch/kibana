import type { TypeOf } from '@kbn/config-schema';
import type { queryDelaySettingsResponseSchemaV1 } from '../../../response';
import type { updateQueryDelaySettingsBodySchemaV1 } from '..';
export type UpdateQueryDelaySettingsRequestBody = TypeOf<typeof updateQueryDelaySettingsBodySchemaV1>;
export type UpdateQueryDelaySettingsResponse = TypeOf<typeof queryDelaySettingsResponseSchemaV1>;
