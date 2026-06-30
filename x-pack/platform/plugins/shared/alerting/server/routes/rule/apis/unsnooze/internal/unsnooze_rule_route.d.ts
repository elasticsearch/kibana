import type { TypeOf } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import { unsnoozeParamsInternalSchema } from '../../../../../../common/routes/rule/apis/unsnooze';
import type { ILicenseState } from '../../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../../types';
export type UnsnoozeRuleRequestParamsV1 = TypeOf<typeof unsnoozeParamsInternalSchema>;
export declare const unsnoozeRuleRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
