import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../../lib/license_state';
import type { MaintenanceWindowRequestHandlerContext } from '../../../../../types';
export declare const finishMaintenanceWindowRoute: (router: IRouter<MaintenanceWindowRequestHandlerContext>, licenseState: ILicenseState) => void;
