import type { CoreSetup, IRouter } from '@kbn/core/server';
import type { AlertingPluginsStart } from '../../../../plugin';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export declare const alertDeleteScheduleRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState, core: CoreSetup<AlertingPluginsStart, unknown>) => void;
