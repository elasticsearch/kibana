export declare enum OAuthRedirectMode {
    NewTab = "new_tab",
    Redirect = "redirect"
}
interface ConnectorOAuthConnectBaseProps {
    connectorId: string;
    returnUrl?: string;
    onError?: (error: Error) => void;
}
interface ConnectorOAuthConnectNewTabProps extends ConnectorOAuthConnectBaseProps {
    redirectMode?: OAuthRedirectMode.NewTab;
    timeout?: number;
    onSuccess?: () => void;
}
interface ConnectorOAuthConnectRedirectProps extends ConnectorOAuthConnectBaseProps {
    redirectMode?: OAuthRedirectMode.Redirect;
    timeout?: never;
    onSuccess?: never;
}
export type ConnectorOAuthConnectProps = ConnectorOAuthConnectNewTabProps | ConnectorOAuthConnectRedirectProps;
export interface ConnectorOAuthConnect {
    connect: () => void;
    cancelConnect: () => void;
    isConnecting: boolean;
    isAwaitingCallback: boolean;
}
/**
 * Initiates the OAuth authorization code grant flow for a connector
 * (via `connect()`).
 *
 * In `NewTab` mode, the hook listens for flow completion and invokes
 * `onSuccess`/`onError` callbacks. `isAwaitingCallback` is `true` while waiting
 * for the user to complete authorization in the other tab, and resets after flow
 * completion or after `timeout` elapses.
 *
 * In `Redirect` mode, the page navigates away. `onSuccess` and
 * `isAwaitingCallback` are not applicable.
 *
 * When `returnUrl` is provided, the OAuth callback redirects to that URL with
 * result query parameters (requires `useOAuthRedirectResult` at that page).
 * When omitted, the callback renders a self-contained HTML page.
 */
export declare const useConnectorOAuthConnect: ({ connectorId, redirectMode, returnUrl, timeout, onSuccess, onError, }: ConnectorOAuthConnectProps) => ConnectorOAuthConnect;
export {};
