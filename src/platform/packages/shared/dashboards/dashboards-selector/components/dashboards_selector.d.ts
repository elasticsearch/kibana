import type { UiActionsStart } from '@kbn/ui-actions-plugin/public';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import React from 'react';
export declare function DashboardsSelector({ uiActions, dashboardsFormData, onChange, placeholder, }: {
    uiActions: UiActionsStart;
    dashboardsFormData: {
        id: string;
    }[];
    onChange: (selectedOptions: Array<EuiComboBoxOptionOption<string>>) => void;
    placeholder?: string;
}): React.JSX.Element;
