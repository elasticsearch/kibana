import type { ElasticsearchClient, KibanaRequest, Logger, SecurityServiceStart } from '@kbn/core/server';
import type { TaskManagerSetupContract, TaskManagerStartContract } from '@kbn/task-manager-plugin/server';
import type { IEventLogger } from '@kbn/event-log-plugin/server';
import type { AuditServiceSetup } from '@kbn/security-plugin-types-server';
import type { SpacesServiceStart } from '@kbn/spaces-plugin/server';
import type { RulesSettingsAlertDeleteProperties } from '@kbn/alerting-types';
import type { GetAlertIndicesAlias } from '../lib';
import type { RuleTypeRegistry } from '../types';
export declare const ALERT_DELETION_TASK_TYPE = "alert-deletion";
export declare const allowedAppCategories: string[];
interface ConstructorOpts {
    auditService?: AuditServiceSetup;
    elasticsearchClientPromise: Promise<ElasticsearchClient>;
    eventLogger: IEventLogger;
    getAlertIndicesAlias: GetAlertIndicesAlias;
    logger: Logger;
    ruleTypeRegistry: RuleTypeRegistry;
    securityService: Promise<SecurityServiceStart>;
    spacesService: Promise<SpacesServiceStart | undefined>;
    taskManagerSetup: TaskManagerSetupContract;
    taskManagerStartPromise: Promise<TaskManagerStartContract>;
}
export interface AlertDeletionContext {
    auditService?: AuditServiceSetup;
    elasticsearchClientPromise: Promise<ElasticsearchClient>;
    eventLogger: IEventLogger;
    getAlertIndicesAlias: GetAlertIndicesAlias;
    logger: Logger;
    ruleTypeRegistry: RuleTypeRegistry;
    securityService: Promise<SecurityServiceStart>;
    spacesService: Promise<SpacesServiceStart | undefined>;
    taskManagerStartPromise: Promise<TaskManagerStartContract>;
}
export declare class AlertDeletionClient {
    private context;
    constructor(opts: ConstructorOpts);
    getLastRun(req: KibanaRequest): Promise<string | undefined>;
    scheduleTask(request: KibanaRequest, settings: RulesSettingsAlertDeleteProperties, spaceIds: string[]): Promise<string | undefined>;
    previewTask(settings: RulesSettingsAlertDeleteProperties, spaceId: string): Promise<number>;
    private runTask;
}
export {};
