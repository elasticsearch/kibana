import type { TypeOf } from '@kbn/config-schema';
import type { muteAlertQuerySchemaV1, muteAlertParamsSchemaV1 } from '..';
export type MuteAlertRequestParams = TypeOf<typeof muteAlertParamsSchemaV1>;
export type MuteAlertRequestQuery = TypeOf<typeof muteAlertQuerySchemaV1>;
