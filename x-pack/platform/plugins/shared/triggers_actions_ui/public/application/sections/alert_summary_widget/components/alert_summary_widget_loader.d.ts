import React from 'react';
import type { AlertSummaryWidgetProps } from '..';
type Props = {
    isLoadingWithoutChart: boolean | undefined;
} & Pick<AlertSummaryWidgetProps, 'fullSize'>;
export declare const AlertSummaryWidgetLoader: ({ fullSize, isLoadingWithoutChart }: Props) => React.JSX.Element;
export {};
