import React from 'react';
import type { AggregationType } from '../types';
export interface WhenExpressionProps {
    aggType: string;
    customAggTypesOptions?: {
        [key: string]: AggregationType;
    };
    onChangeSelectedAggType: (selectedAggType: string) => void;
    popupPosition?: 'upCenter' | 'upLeft' | 'upRight' | 'downCenter' | 'downLeft' | 'downRight' | 'leftCenter' | 'leftUp' | 'leftDown' | 'rightCenter' | 'rightUp' | 'rightDown';
    display?: 'fullWidth' | 'inline';
}
export declare const WhenExpression: ({ aggType, customAggTypesOptions, onChangeSelectedAggType, display, popupPosition, }: WhenExpressionProps) => React.JSX.Element;
export { WhenExpression as default };
