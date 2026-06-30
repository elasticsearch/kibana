import React from 'react';
import type { IErrorObject } from '../../types';
export interface ForLastExpressionProps {
    description?: string;
    timeWindowSize?: number;
    timeWindowUnit?: string;
    errors: IErrorObject;
    isTimeSizeBelowRecommended?: boolean;
    onChangeWindowSize: (selectedWindowSize: number | undefined) => void;
    onChangeWindowUnit: (selectedWindowUnit: string) => void;
    popupPosition?: 'upCenter' | 'upLeft' | 'upRight' | 'downCenter' | 'downLeft' | 'downRight' | 'leftCenter' | 'leftUp' | 'leftDown' | 'rightCenter' | 'rightUp' | 'rightDown';
    display?: 'fullWidth' | 'inline';
}
export declare const ForLastExpression: ({ timeWindowSize, timeWindowUnit, display, errors, onChangeWindowSize, onChangeWindowUnit, popupPosition, isTimeSizeBelowRecommended, description, }: ForLastExpressionProps) => React.JSX.Element;
export { ForLastExpression as default };
