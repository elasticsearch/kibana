import type { TypeOf } from '@kbn/config-schema';
import type { findMaintenanceWindowsResponseSchema, findMaintenanceWindowsQuerySchema } from '../schemas/v1';
export type FindMaintenanceWindowsResponse = TypeOf<typeof findMaintenanceWindowsResponseSchema>;
export type FindMaintenanceWindowsQuery = TypeOf<typeof findMaintenanceWindowsQuerySchema>;
