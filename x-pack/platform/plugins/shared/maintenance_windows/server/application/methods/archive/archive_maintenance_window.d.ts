import type { MaintenanceWindowClientContext } from '../../../../common';
import type { MaintenanceWindow } from '../../types';
import type { ArchiveMaintenanceWindowParams } from './types';
export declare function archiveMaintenanceWindow(context: MaintenanceWindowClientContext, params: ArchiveMaintenanceWindowParams): Promise<MaintenanceWindow>;
