import type { AlertDeletePreview } from '@kbn/alerting-types';
import type { AlertDeletePreviewResponseV1 } from '../../../../../common/routes/alert_delete';
export declare const transformAlertDeletePreviewToResponse: ({ affectedAlertCount, }: AlertDeletePreview) => AlertDeletePreviewResponseV1;
