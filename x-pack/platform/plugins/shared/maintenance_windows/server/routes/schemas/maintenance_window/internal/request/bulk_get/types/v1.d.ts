import type { TypeOf } from '@kbn/config-schema';
import type { MaintenanceWindowResponseV1 } from '../../../response';
import type { bulkGetBodySchemaV1 } from '..';
export type BulkGetMaintenanceWindowsRequestBody = TypeOf<typeof bulkGetBodySchemaV1>;
export interface BulkGetMaintenanceWindowsResponseBody {
    maintenance_windows: MaintenanceWindowResponseV1[];
    errors: Array<{
        id: string;
        error: string;
        message: string;
        status_code: number;
    }>;
}
export interface BulkGetMaintenanceWindowsResponse {
    body: BulkGetMaintenanceWindowsResponseBody;
}
