import React from 'react';
export declare const RuleFormScreenContext: React.Context<{
    isConnectorsScreenVisible: boolean;
    isShowRequestScreenVisible: boolean;
    setIsConnectorsScreenVisible: (show: boolean) => void;
    setIsShowRequestScreenVisible: (show: boolean) => void;
}>;
export declare const RuleFormScreenContextProvider: React.FC<React.PropsWithChildren>;
