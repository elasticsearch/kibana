import React from 'react';
import type { HttpStart } from '@kbn/core/public';
import type { AlertDeleteCategoryIds } from '@kbn/alerting-plugin/common/constants/alert_delete';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
interface AlertDeleteDescriptiveFormGroupProps {
    services: {
        http: HttpStart;
        notifications: NotificationsStart;
    };
    categoryIds: AlertDeleteCategoryIds[];
    isDisabled?: boolean;
}
export declare const AlertDeleteDescriptiveFormGroup: ({ services: { http, notifications }, categoryIds, isDisabled, }: AlertDeleteDescriptiveFormGroupProps) => React.JSX.Element;
export {};
