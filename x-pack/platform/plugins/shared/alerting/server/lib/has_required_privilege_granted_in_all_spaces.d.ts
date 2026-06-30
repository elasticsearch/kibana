import type { KibanaRequest } from '@kbn/core/server';
import type { AuthorizationServiceSetup } from '@kbn/security-plugin-types-server';
export interface HasRequiredPrivilegeGrantedInAllSpaces {
    spaceIds: string[];
    requiredPrivilege: string;
    request: KibanaRequest;
    authz?: AuthorizationServiceSetup;
}
export declare const hasRequiredPrivilegeGrantedInAllSpaces: ({ requiredPrivilege, spaceIds, request: req, authz, }: HasRequiredPrivilegeGrantedInAllSpaces) => Promise<boolean>;
