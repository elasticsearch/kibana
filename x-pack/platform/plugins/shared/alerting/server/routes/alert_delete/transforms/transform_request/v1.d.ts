import type { RulesSettingsAlertDeleteProperties } from '@kbn/alerting-types';
import type { AlertDeletePreviewQuery, AlertDeleteScheduleQuery } from '../../../../../common/routes/alert_delete';
export declare const transformRequestToAlertDeletePreview: ({ active_alert_delete_threshold: activeAlertDeleteThreshold, inactive_alert_delete_threshold: inactiveAlertDeleteThreshold, category_ids: _categoryIds, }: AlertDeletePreviewQuery) => RulesSettingsAlertDeleteProperties;
export declare const transformRequestToAlertDeleteSchedule: ({ active_alert_delete_threshold: activeAlertDeleteThreshold, inactive_alert_delete_threshold: inactiveAlertDeleteThreshold, category_ids: categoryIds, space_ids: spaceIds, }: AlertDeleteScheduleQuery) => RulesSettingsAlertDeleteProperties;
