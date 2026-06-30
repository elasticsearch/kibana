import React from 'react';
import type { TriggersAndActionsUiServices } from './rules_app';
export declare const renderApp: (deps: TriggersAndActionsUiServices) => () => void;
export declare const App: ({ deps }: {
    deps: TriggersAndActionsUiServices;
}) => React.ReactElement<any, string | React.JSXElementConstructor<any>>;
