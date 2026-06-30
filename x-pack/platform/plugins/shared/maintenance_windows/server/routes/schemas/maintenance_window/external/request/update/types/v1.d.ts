import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { updateMaintenanceWindowRequestBodySchemaV1, updateMaintenanceWindowRequestParamsSchemaV1 } from '..';
export type UpdateMaintenanceWindowRequestParams = TypeOf<typeof updateMaintenanceWindowRequestParamsSchemaV1>;
export type UpdateMaintenanceWindowRequestBody = TypeOf<typeof updateMaintenanceWindowRequestBodySchemaV1>;
export type UpdateMaintenanceWindowResponse = MaintenanceWindowResponseV1;
