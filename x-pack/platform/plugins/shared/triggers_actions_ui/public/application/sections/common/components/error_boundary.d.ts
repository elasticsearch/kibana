import React from 'react';
export type FallbackComponent = React.ComponentType<{
    error: Error;
}>;
interface ErrorBoundaryProps {
    children?: React.ReactNode;
    fallback: FallbackComponent;
}
interface ErrorBoundaryState {
    error: Error | null;
}
/**
 * A local error boundary component with a configurable fallback UI
 */
export declare class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: {
        error: null;
    };
    static getDerivedStateFromError(error: Error): {
        error: Error;
    };
    render(): string | number | boolean | Iterable<React.ReactNode> | React.JSX.Element | null;
}
export {};
