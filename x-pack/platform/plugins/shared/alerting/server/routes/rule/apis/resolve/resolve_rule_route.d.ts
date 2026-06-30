import type { TypeOf } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import { resolveParamsSchemaV1 } from '../../../../../common/routes/rule/apis/resolve';
import type { ILicenseState } from '../../../../lib';
import type { AlertingRequestHandlerContext } from '../../../../types';
export type ResolveRuleRequestParamsV1 = TypeOf<typeof resolveParamsSchemaV1>;
export declare const resolveRuleRoute: (router: IRouter<AlertingRequestHandlerContext>, licenseState: ILicenseState) => void;
