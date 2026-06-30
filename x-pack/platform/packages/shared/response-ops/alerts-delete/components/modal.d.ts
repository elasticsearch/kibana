import React from 'react';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import type { HttpStart } from '@kbn/core/public';
import { type AlertDeleteCategoryIds } from '@kbn/alerting-plugin/common/constants/alert_delete';
export interface AlertDeleteProps {
    services: {
        http: HttpStart;
        notifications: NotificationsStart;
    };
    categoryIds: AlertDeleteCategoryIds[];
    onCloseModal: () => void;
    isVisible: boolean;
    isDisabled?: boolean;
}
export declare const AlertDeleteModal: ({ services: { http, notifications }, categoryIds, onCloseModal, isVisible, isDisabled, }: AlertDeleteProps) => React.JSX.Element;
export default AlertDeleteModal;
