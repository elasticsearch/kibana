import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { createMaintenanceWindowRequestBodySchemaV1 } from '..';
export type CreateMaintenanceWindowRequestBody = TypeOf<typeof createMaintenanceWindowRequestBodySchemaV1>;
export type CreateMaintenanceWindowResponse = MaintenanceWindowResponseV1;
