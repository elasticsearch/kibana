import type { IRouter } from '@kbn/core/server';
import type { Observable } from 'rxjs';
import type { ConfigSchema } from '@kbn/kql/server/config';
import type { AlertingRequestHandlerContext } from '../../types';
import type { GetAlertIndicesAlias, ILicenseState } from '../../lib';
export declare const AlertsSuggestionsSchema: {
    body: import("@kbn/config-schema").ObjectType<{
        field: import("@kbn/config-schema").Type<string>;
        query: import("@kbn/config-schema").Type<string>;
        filters: import("@kbn/config-schema").Type<any>;
        fieldMeta: import("@kbn/config-schema").Type<any>;
    }>;
};
export declare function registerAlertsValueSuggestionsRoute(router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState, config$: Observable<ConfigSchema>, getAlertIndicesAlias?: GetAlertIndicesAlias): void;
