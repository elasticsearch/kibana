import React from 'react';
export interface UntrackAlertsModalProps {
    onCancel: () => void;
    onConfirm: (untrack: boolean) => void;
}
export declare const UntrackAlertsModal: (props: UntrackAlertsModalProps) => React.JSX.Element;
