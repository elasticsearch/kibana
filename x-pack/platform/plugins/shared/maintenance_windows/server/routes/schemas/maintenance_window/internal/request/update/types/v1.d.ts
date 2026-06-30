import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { updateParamsSchemaV1, updateBodySchemaV1 } from '..';
export type UpdateMaintenanceWindowRequestParams = TypeOf<typeof updateParamsSchemaV1>;
export type UpdateMaintenanceWindowRequestBody = TypeOf<typeof updateBodySchemaV1>;
export interface UpdateMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
