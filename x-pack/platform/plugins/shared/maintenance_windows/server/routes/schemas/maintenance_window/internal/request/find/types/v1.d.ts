import type { TypeOf } from '@kbn/config-schema';
import type { findMaintenanceWindowsResponseBodySchema, findMaintenanceWindowsRequestQuerySchema } from '..';
export type FindMaintenanceWindowsResponse = TypeOf<typeof findMaintenanceWindowsResponseBodySchema>;
export type FindMaintenanceWindowsRequestQuery = TypeOf<typeof findMaintenanceWindowsRequestQuerySchema>;
