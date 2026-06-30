import React from 'react';
import type { ShowRequestActivePage } from '../../types';
interface RequestCodeBlockProps {
    activeTab: ShowRequestActivePage;
    'data-test-subj'?: string;
}
export declare const RequestCodeBlock: (props: RequestCodeBlockProps) => React.JSX.Element;
export {};
