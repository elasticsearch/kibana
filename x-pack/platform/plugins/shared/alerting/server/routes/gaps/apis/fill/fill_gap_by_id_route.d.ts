import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export declare const fillGapByIdRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
