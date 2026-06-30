import type { ReactNode } from 'react';
import React from 'react';
import type { IErrorObject } from '../../types';
export interface ValueExpressionProps {
    description: string;
    value: number;
    valueLabel?: string | ReactNode;
    onChangeSelectedValue: (updatedValue: number) => void;
    popupPosition?: 'upCenter' | 'upLeft' | 'upRight' | 'downCenter' | 'downLeft' | 'downRight' | 'leftCenter' | 'leftUp' | 'leftDown' | 'rightCenter' | 'rightUp' | 'rightDown';
    display?: 'fullWidth' | 'inline';
    errors: string | string[] | IErrorObject;
}
export declare const ValueExpression: ({ description, value, valueLabel, onChangeSelectedValue, display, popupPosition, errors, }: ValueExpressionProps) => React.JSX.Element;
export { ValueExpression as default };
