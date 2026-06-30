import type { TypeOf } from '@kbn/config-schema';
import type { bulkGetMaintenanceWindowsErrorSchema, bulkGetMaintenanceWindowsResultSchema } from '../schemas';
export type BulkGetMaintenanceWindowsError = TypeOf<typeof bulkGetMaintenanceWindowsErrorSchema>;
export type BulkGetMaintenanceWindowsResult = TypeOf<typeof bulkGetMaintenanceWindowsResultSchema>;
