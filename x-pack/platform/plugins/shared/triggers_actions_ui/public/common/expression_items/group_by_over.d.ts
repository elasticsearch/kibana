import React from 'react';
import type { FieldOption, GroupByType } from '../types';
import type { IErrorObject } from '../../types';
export interface GroupByExpressionProps {
    groupBy: string;
    errors: IErrorObject;
    onChangeSelectedTermSize: (selectedTermSize?: number) => void;
    onChangeSelectedTermField: (selectedTermField?: string | string[]) => void;
    onChangeSelectedGroupBy: (selectedGroupBy?: string) => void;
    fields?: FieldOption[];
    termSize?: number;
    termField?: string | string[];
    customGroupByTypes?: {
        [key: string]: GroupByType;
    };
    popupPosition?: 'upCenter' | 'upLeft' | 'upRight' | 'downCenter' | 'downLeft' | 'downRight' | 'leftCenter' | 'leftUp' | 'leftDown' | 'rightCenter' | 'rightUp' | 'rightDown';
    display?: 'fullWidth' | 'inline';
    canSelectMultiTerms?: boolean;
}
export declare const GroupByExpression: ({ groupBy, errors, onChangeSelectedTermSize, onChangeSelectedTermField, onChangeSelectedGroupBy, display, fields, termSize, termField, customGroupByTypes, popupPosition, canSelectMultiTerms, }: GroupByExpressionProps) => React.JSX.Element;
export { GroupByExpression as default };
