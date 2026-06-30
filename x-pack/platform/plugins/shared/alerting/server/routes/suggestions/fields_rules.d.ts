import type { IRouter } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { ILicenseState } from '../../lib';
import type { AlertingRequestHandlerContext } from '../../types';
export declare function registerFieldsRoute(router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState, usageCounter?: UsageCounter): void;
