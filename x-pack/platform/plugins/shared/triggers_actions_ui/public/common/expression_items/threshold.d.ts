import React from 'react';
import type { Comparator } from '@kbn/alerting-comparators';
import type { IErrorObject } from '../../types';
export interface ThresholdExpressionProps {
    thresholdComparator: string;
    errors: IErrorObject;
    onChangeSelectedThresholdComparator: (selectedThresholdComparator?: string) => void;
    onChangeSelectedThreshold: (selectedThreshold?: number[]) => void;
    customComparators?: {
        [key: string]: Comparator;
    };
    threshold?: number[];
    popupPosition?: 'upCenter' | 'upLeft' | 'upRight' | 'downCenter' | 'downLeft' | 'downRight' | 'leftCenter' | 'leftUp' | 'leftDown' | 'rightCenter' | 'rightUp' | 'rightDown';
    display?: 'fullWidth' | 'inline';
    unit?: string;
}
export declare const ThresholdExpression: ({ thresholdComparator, errors, onChangeSelectedThresholdComparator, onChangeSelectedThreshold, customComparators, display, threshold, popupPosition, unit, }: ThresholdExpressionProps) => React.JSX.Element;
export { ThresholdExpression as default };
