import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export declare const getBackfillRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
export declare const getBackfillPublicRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
