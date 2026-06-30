import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export declare const alertDeleteLastRunRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
