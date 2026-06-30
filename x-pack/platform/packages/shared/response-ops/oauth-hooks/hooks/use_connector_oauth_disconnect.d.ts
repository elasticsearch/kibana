export interface ConnectorOAuthDisconnectProps {
    connectorId: string;
    onSuccess?: () => void;
    onError?: (error: Error) => void;
}
export interface ConnectorOAuthDisconnect {
    disconnect: () => void;
    isDisconnecting: boolean;
}
/**
 * Disconnects a connector from its OAuth authorization by removing all stored
 * access and refresh tokens (via `disconnect()`).
 */
export declare const useConnectorOAuthDisconnect: ({ connectorId, onSuccess, onError, }: ConnectorOAuthDisconnectProps) => ConnectorOAuthDisconnect;
