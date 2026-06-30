import type { TypeOf } from '@kbn/config-schema';
import type { findMaintenanceWindowsParamsSchema, maintenanceWindowsStatusSchema } from '../schemas';
export type MaintenanceWindowsStatus = TypeOf<typeof maintenanceWindowsStatusSchema>;
export type FindMaintenanceWindowsParams = TypeOf<typeof findMaintenanceWindowsParamsSchema>;
