import React from 'react';
import type { EsQuerySnapshot } from '@kbn/alerting-types';
export interface ModalInspectProps {
    closeModal: () => void;
    alertsQuerySnapshot: EsQuerySnapshot;
    title: string;
}
export declare const AlertsQueryInspectorModal: React.MemoExoticComponent<({ closeModal, alertsQuerySnapshot, title, }: ModalInspectProps) => React.JSX.Element>;
