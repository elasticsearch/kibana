import type { IRouter } from '@kbn/core/server';
import type { Observable } from 'rxjs';
import type { ConfigSchema } from '@kbn/kql/server/config';
import type { UsageCounter } from '@kbn/usage-collection-plugin/server';
import type { ILicenseState } from '../../lib';
import type { AlertingRequestHandlerContext } from '../../types';
export declare const RulesSuggestionsSchema: {
    body: import("@kbn/config-schema").ObjectType<{
        field: import("@kbn/config-schema").Type<string>;
        query: import("@kbn/config-schema").Type<string>;
        filters: import("@kbn/config-schema").Type<any>;
        fieldMeta: import("@kbn/config-schema").Type<any>;
    }>;
};
export declare function registerRulesValueSuggestionsRoute(router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState, config$: Observable<ConfigSchema>, usageCounter?: UsageCounter): void;
