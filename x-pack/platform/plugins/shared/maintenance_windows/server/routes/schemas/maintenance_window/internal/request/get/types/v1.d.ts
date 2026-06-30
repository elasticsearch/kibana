import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { getParamsSchemaV1 } from '..';
export type GetMaintenanceWindowRequestParams = TypeOf<typeof getParamsSchemaV1>;
export interface GetMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
