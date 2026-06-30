import type { ActionConnector } from '../../types';
/**
 * Checks if a connector uses an OAuth Authorization Code flow
 * @param connector - The connector to check
 * @returns True if the connector uses oauth_authorization_code or ears auth type
 */
export declare function usesOAuthAuthorizationCode(connector: ActionConnector): boolean;
