import type { CoreSetup, IRouter } from '@kbn/core/server';
import type { GetAlertIndicesAlias, ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext, RuleTypeRegistry } from '../../../../types';
import type { AlertingPluginsStart } from '../../../../plugin';
export declare const ruleQueryInspectorRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState, ruleTypeRegistry: RuleTypeRegistry, getAlertIndicesAlias: GetAlertIndicesAlias, core: CoreSetup<AlertingPluginsStart, unknown>) => void;
