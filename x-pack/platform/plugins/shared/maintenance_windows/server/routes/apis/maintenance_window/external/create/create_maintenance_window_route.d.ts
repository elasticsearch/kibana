import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../../lib';
import type { MaintenanceWindowRequestHandlerContext } from '../../../../../types';
export declare const createMaintenanceWindowRoute: (router: IRouter<MaintenanceWindowRequestHandlerContext>, licenseState: ILicenseState) => void;
