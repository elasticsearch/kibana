export interface OAuthRedirectResultProps {
    onSuccess?: (connectorId: string) => void;
    onError?: (connectorId: string, error: Error) => void;
}
/**
 * Detects OAuth flow completion from URL query parameters set by the server-side
 * callback route. If the `auto_close` query parameter is present, it closes the
 * current tab after processing.
 *
 * Should be rendered in any page that serves as an OAuth return URL.
 */
export declare const useOAuthRedirectResult: ({ onSuccess, onError, }?: OAuthRedirectResultProps) => void;
