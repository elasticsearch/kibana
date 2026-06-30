import type { MaintenanceWindowClientContext } from '../../../../common';
import type { MaintenanceWindow } from '../../types';
import type { FinishMaintenanceWindowParams } from './types';
export declare function finishMaintenanceWindow(context: MaintenanceWindowClientContext, params: FinishMaintenanceWindowParams): Promise<MaintenanceWindow>;
