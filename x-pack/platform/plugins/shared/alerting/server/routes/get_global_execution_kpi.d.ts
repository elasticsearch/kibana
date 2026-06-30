import type { IRouter } from '@kbn/core/server';
import type { AlertingRequestHandlerContext } from '../types';
import type { ILicenseState } from '../lib';
export declare const getGlobalExecutionKPIRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
