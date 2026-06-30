import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { unarchiveMaintenanceWindowRequestParamsSchemaV1 } from '..';
export type UnarchiveMaintenanceWindowRequestParams = TypeOf<typeof unarchiveMaintenanceWindowRequestParamsSchemaV1>;
export interface UnarchiveMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
