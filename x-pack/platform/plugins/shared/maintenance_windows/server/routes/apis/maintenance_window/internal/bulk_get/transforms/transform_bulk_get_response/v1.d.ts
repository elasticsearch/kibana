import type { BulkGetMaintenanceWindowsResponseBodyV1 } from '../../../../../../schemas/maintenance_window/internal/request/bulk_get';
import type { BulkGetMaintenanceWindowsResult } from '../../../../../../../application/methods/bulk_get/types';
export declare const transformBulkGetResultToResponse: (result: BulkGetMaintenanceWindowsResult) => BulkGetMaintenanceWindowsResponseBodyV1;
