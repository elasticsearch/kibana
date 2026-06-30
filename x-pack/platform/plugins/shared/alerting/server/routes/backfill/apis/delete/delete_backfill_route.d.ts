import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export declare const deleteBackfillRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
export declare const deleteBackfillPublicRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
