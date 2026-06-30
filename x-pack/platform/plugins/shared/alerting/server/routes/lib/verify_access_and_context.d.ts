import type { RequestHandler } from '@kbn/core/server';
import type { ILicenseState } from '../../lib';
import type { AlertingRequestHandlerContext } from '../../types';
type AlertingRequestHandlerWrapper = <P, Q, B>(licenseState: ILicenseState, handler: RequestHandler<P, Q, B, AlertingRequestHandlerContext>) => RequestHandler<P, Q, B, AlertingRequestHandlerContext>;
export declare const verifyAccessAndContext: AlertingRequestHandlerWrapper;
export {};
