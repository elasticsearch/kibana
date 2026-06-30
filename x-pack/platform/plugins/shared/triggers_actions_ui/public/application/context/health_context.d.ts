import React from 'react';
export interface HealthContextValue {
    loadingHealthCheck: boolean;
    setLoadingHealthCheck: (loading: boolean) => void;
}
export declare const HealthContextProvider: ({ children }: {
    children: React.ReactNode;
}) => React.JSX.Element;
export declare const useHealthContext: () => HealthContextValue;
