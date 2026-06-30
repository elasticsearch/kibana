import React from 'react';
import type { AggregationType } from '../types';
import type { IErrorObject } from '../../types';
export interface OfExpressionProps {
    aggType: string;
    aggField?: string;
    errors: IErrorObject;
    onChangeSelectedAggField: (selectedAggField?: string) => void;
    fields: Record<string, any>;
    customAggTypesOptions?: {
        [key: string]: AggregationType;
    };
    popupPosition?: 'upCenter' | 'upLeft' | 'upRight' | 'downCenter' | 'downLeft' | 'downRight' | 'leftCenter' | 'leftUp' | 'leftDown' | 'rightCenter' | 'rightUp' | 'rightDown';
    display?: 'fullWidth' | 'inline';
    helpText?: string | JSX.Element;
}
export declare const OfExpression: ({ aggType, aggField, errors, onChangeSelectedAggField, fields, display, customAggTypesOptions, popupPosition, helpText, }: OfExpressionProps) => React.JSX.Element;
export { OfExpression as default };
