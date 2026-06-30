import React from 'react';
import type { EuiSelectOption } from '@elastic/eui';
interface ModalThresholdSelectorProps {
    title: string;
    description: string;
    threshold: number;
    thresholdUnit: EuiSelectOption;
    onChangeThreshold: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onChangeThresholdUnit: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    isDisabled: boolean;
    isInvalid: boolean;
    isChecked: boolean;
    error: string[];
    thresholdTestSubj: string;
    thresholdUnitTestSubj: string;
}
export declare const ModalThresholdSelector: ({ title, description, threshold, thresholdUnit, onChangeThreshold, onChangeThresholdUnit, isDisabled, isInvalid, isChecked, error, thresholdTestSubj, thresholdUnitTestSubj, }: ModalThresholdSelectorProps) => React.JSX.Element;
export {};
