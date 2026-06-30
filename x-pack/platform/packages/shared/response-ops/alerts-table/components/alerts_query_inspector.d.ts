import React from 'react';
import type { EsQuerySnapshot } from '@kbn/alerting-types';
export declare const BUTTON_CLASS = "inspectButtonComponent";
interface InspectButtonContainerProps {
    hide?: boolean;
    children: React.ReactNode;
}
export declare const InspectButtonContainer: React.FC<InspectButtonContainerProps>;
interface InspectButtonProps {
    onCloseInspect?: () => void;
    showInspectButton?: boolean;
    alertsQuerySnapshot: EsQuerySnapshot;
    inspectTitle: string;
}
export declare const AlertsQueryInspector: React.NamedExoticComponent<InspectButtonProps>;
export {};
