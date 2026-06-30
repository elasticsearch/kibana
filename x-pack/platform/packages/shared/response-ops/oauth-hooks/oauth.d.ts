import { OAUTH_BROADCAST_CHANNEL_NAME, type OAuthAuthorizationStatus } from '@kbn/actions-plugin/common';
export { OAUTH_BROADCAST_CHANNEL_NAME };
interface OAuthFlowCompletedMessageBase {
    connectorId: string;
    statusCode: number;
}
export interface OAuthFlowCompletedSuccessMessage extends OAuthFlowCompletedMessageBase {
    status: OAuthAuthorizationStatus.Success;
}
export interface OAuthFlowCompletedErrorMessage extends OAuthFlowCompletedMessageBase {
    status: OAuthAuthorizationStatus.Error;
    error: string;
}
export type OAuthFlowCompletedMessage = OAuthFlowCompletedSuccessMessage | OAuthFlowCompletedErrorMessage;
/**
 * Strips all OAuth callback query parameters from a URL string.
 *
 * @param urlStr - An absolute URL string to sanitize.
 * @returns The URL string with OAuth callback query parameters removed.
 */
export declare const stripOAuthCallbackQueryParams: (urlStr: string) => string;
