import type { TypeOf } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import { snoozeParamsInternalSchemaV1 } from '../../../../../../common/routes/rule/apis/snooze';
import type { ILicenseState } from '../../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../../types';
export type SnoozeRuleRequestInternalParamsV1 = TypeOf<typeof snoozeParamsInternalSchemaV1>;
export declare const snoozeRuleRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
