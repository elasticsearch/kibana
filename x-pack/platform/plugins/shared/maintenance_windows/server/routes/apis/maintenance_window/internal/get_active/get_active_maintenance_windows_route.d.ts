import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../../lib/license_state';
import type { MaintenanceWindowRequestHandlerContext } from '../../../../../types';
export declare const getActiveMaintenanceWindowsRoute: (router: IRouter<MaintenanceWindowRequestHandlerContext>, licenseState: ILicenseState) => void;
