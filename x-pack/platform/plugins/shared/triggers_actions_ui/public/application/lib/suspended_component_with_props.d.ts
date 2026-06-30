import React from 'react';
import type { EuiLoadingSpinnerSize } from '@elastic/eui/src/components/loading/loading_spinner';
export declare function suspendedComponentWithProps<T = unknown>(ComponentToSuspend: React.ComponentType<T>, size?: EuiLoadingSpinnerSize): (props: T) => React.JSX.Element;
