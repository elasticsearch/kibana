import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { createBodySchemaV1 } from '..';
export type CreateMaintenanceWindowRequestBody = TypeOf<typeof createBodySchemaV1>;
export interface CreateMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
