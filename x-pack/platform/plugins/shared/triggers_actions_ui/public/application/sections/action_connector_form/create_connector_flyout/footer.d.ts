import React from 'react';
import type { ActionConnector } from '../../../../types';
interface Props {
    hasConnectorTypeSelected: boolean;
    onBack: () => void;
    onCancel: () => void;
    isUsingInitialConnector: boolean;
    onTestConnector?: (connector: ActionConnector) => void;
    testConnector?: () => void;
    isSaving: boolean;
    disabled: boolean;
    onSubmit: () => Promise<void>;
    isTestable?: boolean;
}
export declare const FlyoutFooter: React.NamedExoticComponent<Props>;
export {};
