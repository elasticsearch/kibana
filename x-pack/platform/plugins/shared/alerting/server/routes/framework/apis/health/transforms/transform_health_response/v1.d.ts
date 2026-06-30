import type { AlertingFrameworkHealth } from '../../../../../../types';
import type { HealthFrameworkResponseBodyV1 } from '../../../../../../../common/routes/framework/apis/health';
export declare const transformHealthBodyResponse: (frameworkHealth: AlertingFrameworkHealth) => HealthFrameworkResponseBodyV1;
