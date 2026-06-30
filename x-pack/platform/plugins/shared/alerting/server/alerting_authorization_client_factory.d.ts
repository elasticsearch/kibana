import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { SecurityPluginStart } from '@kbn/security-plugin/server';
import type { FeaturesPluginStart } from '@kbn/features-plugin/server';
import type { Space } from '@kbn/spaces-plugin/server';
import { AlertingAuthorization } from './authorization/alerting_authorization';
import type { RuleTypeRegistry } from './types';
export interface AlertingAuthorizationClientFactoryOpts {
    ruleTypeRegistry: RuleTypeRegistry;
    securityPluginStart?: SecurityPluginStart;
    logger: Logger;
    getSpace: (request: KibanaRequest) => Promise<Space | undefined>;
    /**
     * Retrieves a specific space by id using the provided request context.
     * When available, this enables creating an AlertingAuthorization instance that is scoped to an explicit space
     * (instead of the request's active space).
     */
    getSpaceById?: (request: KibanaRequest, spaceId: string) => Promise<Space | undefined>;
    getSpaceId: (request: KibanaRequest) => string;
    features: FeaturesPluginStart;
}
export declare class AlertingAuthorizationClientFactory {
    private isInitialized;
    protected options?: AlertingAuthorizationClientFactoryOpts;
    initialize(options: AlertingAuthorizationClientFactoryOpts): void;
    create(request: KibanaRequest): Promise<AlertingAuthorization>;
    /**
     * Creates an AlertingAuthorization object scoped to a specific spaceId while preserving the original request
     * (and its auth context).
     */
    createForSpace(request: KibanaRequest, spaceId: string): Promise<AlertingAuthorization>;
    private validateInitialization;
}
