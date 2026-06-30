import type { KueryNode } from '@kbn/es-query';
import type { MaintenanceWindowClientContext } from '../../../../common';
import type { FindMaintenanceWindowsResult, FindMaintenanceWindowsParams, MaintenanceWindowsStatus } from './types';
export declare const getStatusFilter: (status?: MaintenanceWindowsStatus[]) => KueryNode | string | undefined;
export declare function findMaintenanceWindows(context: MaintenanceWindowClientContext, params?: FindMaintenanceWindowsParams): Promise<FindMaintenanceWindowsResult>;
