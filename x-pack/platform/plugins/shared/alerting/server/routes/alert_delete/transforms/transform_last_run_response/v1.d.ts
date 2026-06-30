import type { AlertDeleteLastRun } from '@kbn/alerting-types';
import type { AlertDeleteLastRunResponseV1 } from '../../../../../common/routes/alert_delete';
export declare const transformAlertDeleteLastRunToResponse: ({ lastRun, }: AlertDeleteLastRun) => AlertDeleteLastRunResponseV1;
