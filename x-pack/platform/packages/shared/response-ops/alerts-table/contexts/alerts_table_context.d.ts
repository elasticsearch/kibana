import type { PropsWithChildren } from 'react';
import React from 'react';
import type { AdditionalContext, RenderContext } from '../types';
export declare const AlertsTableContextProvider: <AC extends AdditionalContext = AdditionalContext>({ children, value, }: PropsWithChildren<{
    value: RenderContext<AC>;
}>) => React.JSX.Element;
export declare const useAlertsTableContext: <AC extends AdditionalContext = AdditionalContext>() => RenderContext<AC>;
