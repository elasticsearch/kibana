import type { CoreSetup, DocLinksServiceSetup, IRouter } from '@kbn/core/server';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { EncryptedSavedObjectsPluginSetup } from '@kbn/encrypted-saved-objects-plugin/server';
import type { ConfigSchema } from '@kbn/kql/server/config';
import type { Observable } from 'rxjs';
import type { AlertingConfig } from '../config';
import type { GetAlertIndicesAlias, ILicenseState } from '../lib';
import type { AlertingRequestHandlerContext } from '../types';
import type { AlertingPluginsStart } from '../plugin';
export interface RouteOptions {
    router: IRouter<AlertingRequestHandlerContext>;
    licenseState: ILicenseState;
    encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
    getAlertIndicesAlias?: GetAlertIndicesAlias;
    usageCounter?: UsageCounter;
    config$?: Observable<ConfigSchema>;
    isServerless?: boolean;
    docLinks: DocLinksServiceSetup;
    alertingConfig: AlertingConfig;
    core: CoreSetup<AlertingPluginsStart, unknown>;
}
export declare function defineRoutes(opts: RouteOptions): void;
