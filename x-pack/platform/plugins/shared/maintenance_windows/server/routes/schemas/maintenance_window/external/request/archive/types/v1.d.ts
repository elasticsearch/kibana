import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { archiveMaintenanceWindowRequestParamsSchemaV1 } from '..';
export type ArchiveMaintenanceWindowRequestParams = TypeOf<typeof archiveMaintenanceWindowRequestParamsSchemaV1>;
export interface ArchiveMaintenanceWindowResponse {
    body: MaintenanceWindowResponseV1;
}
