export interface UseSubActionParams<P> {
    connectorId?: string;
    subAction?: string;
    subActionParams?: P;
    disabled?: boolean;
}
export declare const useSubAction: <P, R>({ connectorId, subAction, subActionParams, disabled, }: UseSubActionParams<P>) => {
    isLoading: boolean;
    response: R | undefined;
    error: Error | null;
};
