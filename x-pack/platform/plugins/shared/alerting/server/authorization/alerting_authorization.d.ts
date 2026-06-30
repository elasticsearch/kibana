import type { KibanaRequest } from '@kbn/core/server';
import type { JsonObject } from '@kbn/utility-types';
import type { KueryNode } from '@kbn/es-query';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { FeaturesPluginStart } from '@kbn/features-plugin/server';
import type { Space } from '@kbn/spaces-plugin/server';
import type { RegistryRuleType } from '../rule_type_registry';
import type { RuleTypeRegistry } from '../types';
import type { AlertingAuthorizationFilterOpts } from './alerting_authorization_kuery';
import type { AlertingAuthorizationEntity } from './types';
import { ReadOperations, WriteOperations } from './types';
export interface EnsureAuthorizedOpts {
    ruleTypeId: string;
    consumer: string;
    operation: ReadOperations | WriteOperations;
    entity: AlertingAuthorizationEntity;
    additionalPrivileges?: string[];
}
export interface BulkEnsureAuthorizedOpts {
    ruleTypeIdConsumersPairs: Array<{
        ruleTypeId: string;
        consumers: string[];
    }>;
    operation: ReadOperations | WriteOperations;
    entity: AlertingAuthorizationEntity;
    additionalPrivileges?: string[];
}
interface HasPrivileges {
    read: boolean;
    all: boolean;
}
type AuthorizedConsumers = Record<string, HasPrivileges>;
export interface RegistryAlertTypeWithAuth extends RegistryRuleType {
    authorizedConsumers: AuthorizedConsumers;
}
export type AuthorizedRuleTypes = Map<string, {
    authorizedConsumers: AuthorizedConsumers;
}>;
export interface CreateOptions {
    ruleTypeRegistry: RuleTypeRegistry;
    request: KibanaRequest;
    features: FeaturesPluginStart;
    getSpace: (request: KibanaRequest) => Promise<Space | undefined>;
    getSpaceId: (request: KibanaRequest) => string | undefined;
    authorization?: SecurityPluginStart['authz'];
}
type ConstructorOptions = Pick<CreateOptions, 'ruleTypeRegistry' | 'request' | 'authorization' | 'getSpaceId'> & {
    allRegisteredConsumers: Set<string>;
    ruleTypesConsumersMap: Map<string, Set<string>>;
};
interface GetAuthorizationFilterParams {
    authorizationEntity: AlertingAuthorizationEntity;
    filterOpts: AlertingAuthorizationFilterOpts;
    operation: WriteOperations | ReadOperations;
}
interface GetAllAuthorizedRuleTypesFindOperationParams {
    authorizationEntity: AlertingAuthorizationEntity;
    ruleTypeIds?: string[];
}
interface GetFindAuthorizationFilterParams {
    authorizationEntity: AlertingAuthorizationEntity;
    filterOpts: AlertingAuthorizationFilterOpts;
}
interface GetAuthorizedRuleTypesParams {
    ruleTypeIds?: string[];
    operations: Array<ReadOperations | WriteOperations>;
    authorizationEntity: AlertingAuthorizationEntity;
}
interface GetAllAuthorizedRuleTypes {
    operations: Array<ReadOperations | WriteOperations>;
    authorizationEntity: AlertingAuthorizationEntity;
}
export declare class AlertingAuthorization {
    private readonly ruleTypeRegistry;
    private readonly request;
    private readonly authorization?;
    private readonly allRegisteredConsumers;
    private readonly ruleTypesConsumersMap;
    private readonly spaceId;
    constructor({ ruleTypeRegistry, request, authorization, getSpaceId, allRegisteredConsumers, ruleTypesConsumersMap, }: ConstructorOptions);
    /**
     * Creates an AlertingAuthorization object.
     */
    static create({ request, features, getSpace, getSpaceId, authorization, ruleTypeRegistry, }: CreateOptions): Promise<AlertingAuthorization>;
    private shouldCheckAuthorization;
    getSpaceId(): string | undefined;
    getAllAuthorizedRuleTypes(params: GetAllAuthorizedRuleTypes): Promise<{
        username?: string;
        hasAllRequested: boolean;
        authorizedRuleTypes: AuthorizedRuleTypes;
    }>;
    ensureAuthorized({ ruleTypeId, consumer, operation, entity, additionalPrivileges, }: EnsureAuthorizedOpts): Promise<void>;
    bulkEnsureAuthorized({ ruleTypeIdConsumersPairs, operation, entity, additionalPrivileges, }: BulkEnsureAuthorizedOpts): Promise<void>;
    private _ensureAuthorized;
    getFindAuthorizationFilter(params: GetFindAuthorizationFilterParams): Promise<{
        filter?: KueryNode | JsonObject;
        ensureRuleTypeIsAuthorized: (ruleTypeId: string, consumer: string, auth: string) => void;
    }>;
    getAllAuthorizedRuleTypesFindOperation(params: GetAllAuthorizedRuleTypesFindOperationParams): Promise<AuthorizedRuleTypes>;
    getAuthorizationFilter(params: GetAuthorizationFilterParams): Promise<{
        filter?: KueryNode | JsonObject;
        ensureRuleTypeIsAuthorized: (ruleTypeId: string, consumer: string, auth: string) => void;
    }>;
    /**
     * Like `ensureAuthorized` but without a consumer. Checks authorization by ruleTypeId only,
     * succeeding if the user is authorized under any registered consumer.
     */
    ensureAuthorizedByRuleType({ ruleTypeId, operation, entity, consumerRequiredPrivilege, }: {
        ruleTypeId: string;
        operation: ReadOperations | WriteOperations;
        entity: AlertingAuthorizationEntity;
        consumerRequiredPrivilege: keyof HasPrivileges;
    }): Promise<void>;
    /**
     * Like `getAuthorizationFilter` but without consumers. Returns a filter scoped to authorized
     * rule types and an `ensureRuleTypeIsAuthorized` callback for post-query validation.
     */
    getByRuleTypeAuthorizationFilter(params: GetAuthorizationFilterParams): Promise<{
        filter: JsonObject;
        ensureRuleTypeIsAuthorized: (ruleTypeId: string, authType: string) => void;
    }>;
    getAuthorizedRuleTypes(params: GetAuthorizedRuleTypesParams): Promise<AuthorizedRuleTypes>;
    private _getAuthorizedRuleTypesWithAuthorizedConsumers;
    private getRegisteredRuleTypesWithAllRegisteredConsumers;
}
export {};
