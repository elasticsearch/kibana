import type { RequestHandler } from '@kbn/core/server';
import type { ILicenseState } from '../../lib';
import type { MaintenanceWindowRequestHandlerContext } from '../../types';
type AlertingRequestHandlerWrapper = <P, Q, B>(licenseState: ILicenseState, handler: RequestHandler<P, Q, B, MaintenanceWindowRequestHandlerContext>) => RequestHandler<P, Q, B, MaintenanceWindowRequestHandlerContext>;
export declare const verifyAccessAndContext: AlertingRequestHandlerWrapper;
export {};
