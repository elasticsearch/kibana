/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEmpty, isEqual, omit } from 'lodash';
import type { Logger, ElasticsearchClient } from '@kbn/core/server';
import type { Observable } from 'rxjs';
import { filter, firstValueFrom } from 'rxjs';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import { alertFieldMap, ecsFieldMap, legacyAlertFieldMap } from '@kbn/alerts-as-data-utils';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import {
  ALERT_MUTED,
  ALERT_INSTANCE_ID,
  ALERT_RULE_UUID,
  ALERT_STATUS,
  ALERT_STATUS_ACTIVE,
} from '@kbn/rule-data-utils';
import {
  DEFAULT_ALERTS_ILM_POLICY_NAME,
  DEFAULT_ALERTS_ILM_POLICY,
} from './default_lifecycle_policy';
import {
  getComponentTemplate,
  getComponentTemplateName,
  getIndexTemplateAndPattern,
} from './resource_installer_utils';
import type {
  AlertInstanceContext,
  AlertInstanceState,
  IRuleTypeAlerts,
  RuleAlertData,
  DataStreamAdapter,
} from '../types';
import type {
  InitializationPromise,
  ResourceInstallationHelper,
} from './create_resource_installation_helper';
import {
  createResourceInstallationHelper,
  errorResult,
  successResult,
} from './create_resource_installation_helper';
import {
  createOrUpdateIlmPolicy,
  createOrUpdateComponentTemplate,
  getIndexTemplate,
  createOrUpdateIndexTemplate,
  createConcreteWriteIndex,
  installWithTimeout,
  InstallShutdownError,
} from './lib';
import type { LegacyAlertsClientParams, AlertRuleData } from '../alerts_client';
import { AlertsClient } from '../alerts_client';
import type { IAlertsClient } from '../alerts_client/types';
import type { SetAlertsToUntrackedParams } from './lib/set_alerts_to_untracked';
import { setAlertsToUntracked } from './lib/set_alerts_to_untracked';
import type { ClearAlertFlappingHistoryParams } from './lib/clear_alert_flapping_history';
import { clearAlertFlappingHistory } from './lib/clear_alert_flapping_history';
import type { IsExistingAlertParams } from './lib/is_existing_alert';
import { isExistingAlert } from './lib/is_existing_alert';
/**
 * Default field limit for alerts-as-data (`.alerts-*`) indices, their index
 * templates and component templates.
 *
 * Usage:
 * - `AlertsService` uses it only as a fallback when `totalFieldsLimit` is not
 *   provided (e.g. in tests). In production the value comes from
 *   `xpack.alerting.alertsService.totalFieldsLimit` (see `config.ts`), so keep
 *   that config default in sync with this constant.
 * - Re-exported from `@kbn/alerting-plugin/server` and consumed directly by
 *   `rule_registry` (`resource_installer.ts`) when installing its own
 *   technical/component templates, and by the AAD integration tests.
 *
 * Note: other plugins (alerting_v2, security_solution siem_migrations /
 * workflow_insights, elastic_assistant, ecs_data_quality_dashboard) define
 * their own local field-limit constants and are NOT affected by this value.
 */
export const TOTAL_FIELDS_LIMIT = 2800;
const LEGACY_ALERT_CONTEXT = 'legacy-alert';
export const ECS_CONTEXT = `ecs`;
export const ECS_COMPONENT_TEMPLATE_NAME = getComponentTemplateName({ name: ECS_CONTEXT });
interface AlertsServiceParams {
  logger: Logger;
  pluginStop$: Observable<void>;
  kibanaVersion: string;
  elasticsearchClientPromise: Promise<ElasticsearchClient>;
  timeoutMs?: number;
  dataStreamAdapter: DataStreamAdapter;
  elasticsearchAndSOAvailability$: Observable<boolean>;
  isServerless: boolean;
  /**
   * Field limit applied to alerts-as-data indices/templates. Defaults to
   * `TOTAL_FIELDS_LIMIT` when not provided (e.g. in tests). In production this
   * is sourced from `xpack.alerting.alertsService.totalFieldsLimit`.
   */
  totalFieldsLimit?: number;
}

export interface CreateAlertsClientParams extends LegacyAlertsClientParams {
  namespace: string;
  rule: AlertRuleData;
}

export type MuteInstances = Array<{ ruleId: string; alertInstanceIds?: string[] }>;

interface IAlertsService {
  /**
   * Register solution specific resources. If common resource initialization is
   * complete, go ahead and install those resources, otherwise add to queue to
   * await initialization
   *
   * Solution specific resources include:
   * - Component template - solution specific mappings for fields used only by solution rule types
   * - Index templates - solution specific template that combines common and solution specific component templates
   * - Concrete write index - solution specific write index
   */
  register(opts: IRuleTypeAlerts, timeoutMs?: number): void;

  isInitialized(): boolean;

  /**
   * Returns promise that resolves when the resources for the given
   * context in the given namespace are installed. These include the context specific component template,
   * the index template for the default namespace and the concrete write index
   * for the default namespace.
   */
  getContextInitializationPromise(
    context: string,
    namespace: string
  ): Promise<InitializationPromise>;

  /**
   * If the rule type has registered an alert context, initialize and return an AlertsClient,
   * otherwise return null. Currently registering an alert context is optional but in the future
   * we will make it a requirement for all rule types and this function should not return null.
   */
  createAlertsClient<
    AlertData extends RuleAlertData,
    LegacyState extends AlertInstanceState,
    LegacyContext extends AlertInstanceContext,
    ActionGroupIds extends string,
    RecoveryActionGroupId extends string
  >(
    opts: CreateAlertsClientParams
  ): Promise<IAlertsClient<
    AlertData,
    LegacyState,
    LegacyContext,
    ActionGroupIds,
    RecoveryActionGroupId
  > | null>;
}

export type PublicAlertsService = Pick<IAlertsService, 'getContextInitializationPromise'>;
export type PublicFrameworkAlertsService = PublicAlertsService & {
  enabled: () => boolean;
  /**
   * Field limit applied to alerts-as-data (`.alerts-*`) resources, sourced from
   * `xpack.alerting.alertsService.totalFieldsLimit`. Consumed by `rule_registry`
   * so its technical/component templates and indices use the same configurable
   * limit as the alerting framework. Optional so existing mocks remain valid;
   * consumers fall back to `TOTAL_FIELDS_LIMIT` when it is not provided.
   */
  getTotalFieldsLimit?: () => number;
};

export class AlertsService implements IAlertsService {
  private initialized: boolean;
  private isServerless: boolean;
  private isInitializing = false;
  private resourceInitializationHelper: ResourceInstallationHelper;
  private registeredContexts: Map<string, IRuleTypeAlerts> = new Map();
  private commonInitPromise: Promise<InitializationPromise>;
  private dataStreamAdapter: DataStreamAdapter;
  private totalFieldsLimit: number;

  constructor(private readonly options: AlertsServiceParams) {
    this.initialized = false;

    this.isServerless = options.isServerless;
    this.dataStreamAdapter = options.dataStreamAdapter;
    this.totalFieldsLimit = options.totalFieldsLimit ?? TOTAL_FIELDS_LIMIT;

    // Kick off initialization of common assets and save the promise
    this.commonInitPromise = this.initializeCommon(
      this.options.elasticsearchAndSOAvailability$,
      this.options.timeoutMs
    );

    // Create helper for initializing context-specific resources
    this.resourceInitializationHelper = createResourceInstallationHelper(
      this.options.logger,
      this.commonInitPromise,
      this.initializeContext.bind(this)
    );
  }

  public isInitialized() {
    return this.initialized;
  }

  public async createAlertsClient<
    AlertData extends RuleAlertData,
    LegacyState extends AlertInstanceState,
    LegacyContext extends AlertInstanceContext,
    ActionGroupIds extends string,
    RecoveryActionGroupId extends string
  >(
    opts: CreateAlertsClientParams
  ): Promise<IAlertsClient<
    AlertData,
    LegacyState,
    LegacyContext,
    ActionGroupIds,
    RecoveryActionGroupId
  > | null> {
    if (!opts.ruleType.alerts) {
      return null;
    }

    // Check if context specific installation has succeeded
    const { result: initialized, error } = await this.getContextInitializationPromise(
      opts.ruleType.alerts.context,
      opts.namespace
    );

    // If initialization failed, retry
    if (!initialized && error) {
      let initPromise: Promise<InitializationPromise> | undefined;

      // If !this.initialized, we know that common resource initialization failed
      // and we need to retry this before retrying the context specific resources
      // However, if this.isInitializing, then the alerts service is in the process
      // of retrying common installation, so we don't want to kick off another retry
      if (!this.initialized) {
        if (!this.isInitializing) {
          this.options.logger.info(`Retrying common resource initialization`);
          initPromise = this.initializeCommon(
            this.options.elasticsearchAndSOAvailability$,
            this.options.timeoutMs
          );
        } else {
          this.options.logger.info(
            `Skipped retrying common resource initialization because it is already being retried.`
          );
        }
      }

      this.resourceInitializationHelper.retry(
        opts.ruleType.alerts as IRuleTypeAlerts,
        opts.namespace,
        initPromise
      );

      const retryResult = await this.resourceInitializationHelper.getInitializedContext(
        opts.ruleType.alerts.context,
        opts.ruleType.alerts.isSpaceAware ? opts.namespace : DEFAULT_NAMESPACE_STRING
      );

      if (!retryResult.result) {
        const errorLogPrefix = `There was an error in the framework installing namespace-level resources and creating concrete indices for context "${opts.ruleType.alerts.context}" - `;
        // Retry also failed
        this.options.logger.warn(
          retryResult.error === error
            ? `${errorLogPrefix}Retry failed with error: ${error}`
            : `${errorLogPrefix}Original error: ${error}; Error after retry: ${retryResult.error}`
        );
        return null;
      } else {
        this.options.logger.info(
          `Resource installation for "${opts.ruleType.alerts.context}" succeeded after retry`
        );
      }
    }

    // TODO - when we replace the LegacyAlertsClient, we will need to decide whether to
    // initialize the AlertsClient even if alert resource installation failed. That would allow
    // us to detect alerts and trigger notifications even if we can't persist the alerts
    // (partial rule failure vs failing the entire rule execution).
    return new AlertsClient<
      AlertData,
      LegacyState,
      LegacyContext,
      ActionGroupIds,
      RecoveryActionGroupId
    >({
      alertingEventLogger: opts.alertingEventLogger,
      logger: this.options.logger,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      ruleType: opts.ruleType,
      maintenanceWindowsService: opts.maintenanceWindowsService,
      namespace: opts.namespace,
      request: opts.request,
      rule: opts.rule,
      spaceId: opts.spaceId,
      kibanaVersion: this.options.kibanaVersion,
      dataStreamAdapter: this.dataStreamAdapter,
      isServerless: this.isServerless,
    });
  }

  public async getContextInitializationPromise(
    context: string,
    namespace: string
  ): Promise<InitializationPromise> {
    const registeredOpts = this.registeredContexts.has(context)
      ? this.registeredContexts.get(context)
      : null;

    if (!registeredOpts) {
      const errMsg = `Error getting initialized status for context ${context} - context has not been registered.`;
      this.options.logger.error(errMsg);
      return errorResult(errMsg);
    }

    const result = await this.resourceInitializationHelper.getInitializedContext(
      context,
      registeredOpts.isSpaceAware ? namespace : DEFAULT_NAMESPACE_STRING
    );

    // If the context is unrecognized and namespace is not the default, we
    // need to kick off resource installation and return the promise
    if (
      result.error &&
      result.error.includes(`Unrecognized context`) &&
      namespace !== DEFAULT_NAMESPACE_STRING
    ) {
      this.resourceInitializationHelper.add(registeredOpts, namespace);

      return this.resourceInitializationHelper.getInitializedContext(context, namespace);
    }

    return result;
  }

  public register(opts: IRuleTypeAlerts, timeoutMs?: number) {
    const { context } = opts;
    // check whether this context has been registered before
    if (this.registeredContexts.has(context)) {
      const registeredOptions = this.registeredContexts.get(context);
      if (!isEqual(omit(opts, 'shouldWrite'), omit(registeredOptions, 'shouldWrite'))) {
        throw new Error(`${context} has already been registered with different options`);
      }
      this.options.logger.debug(`Resources for context "${context}" have already been registered.`);
      return;
    }

    this.options.logger.debug(`Registering resources for context "${context}".`);
    this.registeredContexts.set(context, opts);

    // When a context is registered, we install resources in the default namespace by default
    this.resourceInitializationHelper.add(opts, DEFAULT_NAMESPACE_STRING, timeoutMs);
  }

  /**
   * Initializes the common ES resources needed for framework alerts as data
   * - ILM policy - common policy shared by all AAD indices
   * - Component template - common mappings for fields populated and used by the framework
   */
  private async initializeCommon(
    elasticsearchAndSOAvailability$: Observable<boolean>,
    timeoutMs?: number
  ): Promise<InitializationPromise> {
    this.isInitializing = true;
    // Wait to install resources until ES is ready
    await firstValueFrom(
      elasticsearchAndSOAvailability$.pipe(filter((areESAndSOAvailable) => areESAndSOAvailable))
    );

    try {
      this.options.logger.debug(`Initializing resources for AlertsService`);
      const esClient = await this.options.elasticsearchClientPromise;

      // Common initialization installs ILM policy and shared component templates
      const initFns = [
        () =>
          createOrUpdateIlmPolicy({
            logger: this.options.logger,
            esClient,
            name: DEFAULT_ALERTS_ILM_POLICY_NAME,
            policy: DEFAULT_ALERTS_ILM_POLICY,
            dataStreamAdapter: this.dataStreamAdapter,
          }),
        () =>
          createOrUpdateComponentTemplate({
            logger: this.options.logger,
            esClient,
            template: getComponentTemplate({ fieldMap: alertFieldMap, includeSettings: true }),
            totalFieldsLimit: this.totalFieldsLimit,
          }),
        () =>
          createOrUpdateComponentTemplate({
            logger: this.options.logger,
            esClient,
            template: getComponentTemplate({
              fieldMap: legacyAlertFieldMap,
              name: LEGACY_ALERT_CONTEXT,
              includeSettings: true,
            }),
            totalFieldsLimit: this.totalFieldsLimit,
          }),
        () =>
          createOrUpdateComponentTemplate({
            logger: this.options.logger,
            esClient,
            template: getComponentTemplate({
              fieldMap: ecsFieldMap,
              name: ECS_CONTEXT,
              includeSettings: true,
            }),
            totalFieldsLimit: this.totalFieldsLimit,
          }),
      ];

      // Install in parallel
      await Promise.all(
        initFns.map((fn) =>
          installWithTimeout({
            installFn: async () => await fn(),
            pluginStop$: this.options.pluginStop$,
            logger: this.options.logger,
            timeoutMs,
          })
        )
      );

      this.initialized = true;
      this.isInitializing = false;
      return successResult();
    } catch (err) {
      if (err instanceof InstallShutdownError) {
        this.options.logger.debug(err.message);
      } else {
        this.options.logger.error(
          `Error installing common resources for AlertsService. No additional resources will be installed and rule execution may be impacted. - ${err.message}`
        );
      }

      this.initialized = false;
      this.isInitializing = false;
      return errorResult(err.message);
    }
  }

  private async initializeContext(
    { context, mappings, useEcs, useLegacyAlerts, secondaryAlias }: IRuleTypeAlerts,
    namespace: string = DEFAULT_NAMESPACE_STRING,
    timeoutMs?: number
  ) {
    const esClient = await this.options.elasticsearchClientPromise;

    const indexTemplateAndPattern = getIndexTemplateAndPattern({
      context,
      namespace,
      secondaryAlias,
    });

    let initFns: Array<() => Promise<void>> = [];

    // List of component templates to reference
    // Order matters in this list - templates specified last take precedence over those specified first
    // 1. ECS component template, if using
    // 2. Context specific component template, if defined during registration
    // 3. Legacy alert component template, if using
    // 4. Framework common component template, always included
    const componentTemplateRefs: string[] = [];

    // If useEcs is set to true, add the ECS component template to the references
    if (useEcs) {
      componentTemplateRefs.push(getComponentTemplateName({ name: ECS_CONTEXT }));
    }

    // If fieldMap is not empty, create a context specific component template and add to the references
    if (!isEmpty(mappings.fieldMap)) {
      const componentTemplate = getComponentTemplate({
        fieldMap: mappings.fieldMap,
        dynamic: mappings.dynamic,
        dynamicTemplates: mappings.dynamicTemplates,
        context,
      });
      initFns.push(
        async () =>
          await createOrUpdateComponentTemplate({
            logger: this.options.logger,
            esClient,
            template: componentTemplate,
            totalFieldsLimit: this.totalFieldsLimit,
          })
      );
      componentTemplateRefs.push(componentTemplate.name);
    }

    // If useLegacy is set to true, add the legacy alert component template to the references
    if (useLegacyAlerts) {
      componentTemplateRefs.push(getComponentTemplateName({ name: LEGACY_ALERT_CONTEXT }));
    }

    // Add framework component template to the references
    componentTemplateRefs.push(getComponentTemplateName());

    // Context specific initialization installs index template and write index
    initFns = initFns.concat([
      async () =>
        await createOrUpdateIndexTemplate({
          logger: this.options.logger,
          esClient,
          template: getIndexTemplate({
            componentTemplateRefs,
            ilmPolicyName: DEFAULT_ALERTS_ILM_POLICY_NAME,
            indexPatterns: indexTemplateAndPattern,
            kibanaVersion: this.options.kibanaVersion,
            namespace,
            totalFieldsLimit: this.totalFieldsLimit,
            dataStreamAdapter: this.dataStreamAdapter,
          }),
        }),
      async () =>
        await createConcreteWriteIndex({
          logger: this.options.logger,
          esClient,
          totalFieldsLimit: this.totalFieldsLimit,
          indexPatterns: indexTemplateAndPattern,
          dataStreamAdapter: this.dataStreamAdapter,
        }),
    ]);

    // We want to install these in sequence and not in parallel because
    // the concrete index depends on the index template which depends on
    // the component template.
    for (const fn of initFns) {
      await installWithTimeout({
        installFn: async () => await fn(),
        pluginStop$: this.options.pluginStop$,
        logger: this.options.logger,
        timeoutMs,
      });
    }
  }

  public async setAlertsToUntracked(opts: SetAlertsToUntrackedParams) {
    return setAlertsToUntracked({
      logger: this.options.logger,
      esClient: await this.options.elasticsearchClientPromise,
      ...opts,
    });
  }

  public async clearAlertFlappingHistory(opts: ClearAlertFlappingHistoryParams) {
    return clearAlertFlappingHistory({
      logger: this.options.logger,
      esClient: await this.options.elasticsearchClientPromise,
      ...opts,
    });
  }

  public async isExistingAlert(params: IsExistingAlertParams): Promise<boolean> {
    return isExistingAlert({
      logger: this.options.logger,
      esClient: await this.options.elasticsearchClientPromise,
      ...params,
    });
  }

  private async _updateMuteState({
    muted,
    targets,
    indices,
    logger,
  }: {
    muted: boolean;
    targets: MuteInstances;
    indices: string[];
    logger: Logger;
  }) {
    if (!indices || indices.length === 0) {
      throw new Error(
        `Unable to update mute state for rules (example: ${JSON.stringify(
          targets[0]
        )}) - no alert indices available`
      );
    }
    if (targets.length === 0) {
      return;
    }

    const esClient = await this.options.elasticsearchClientPromise;

    const shouldClauses: QueryDslQueryContainer[] = targets.map((target) => {
      const must: QueryDslQueryContainer[] = [{ term: { [ALERT_RULE_UUID]: target.ruleId } }];
      if (target.alertInstanceIds) {
        must.push({ terms: { [ALERT_INSTANCE_ID]: target.alertInstanceIds } });
      }
      return { bool: { must } };
    });

    const query: QueryDslQueryContainer = {
      bool: {
        must: [{ term: { [ALERT_STATUS]: ALERT_STATUS_ACTIVE } }],
        should: shouldClauses,
        minimum_should_match: 1,
      },
    };

    try {
      await esClient.updateByQuery({
        index: indices,
        conflicts: 'proceed',
        wait_for_completion: false,
        refresh: true,
        ignore_unavailable: true,
        query,
        script: {
          source: `ctx._source['${ALERT_MUTED}'] = params.muted;`,
          lang: 'painless',
          params: { muted },
        },
      });
    } catch (error) {
      logger.error(
        `Error updating muted field to ${muted} for ${
          targets.length
        } targets (example: ${JSON.stringify(targets[0])}) - ${error.message}`
      );
      throw error;
    }
  }

  public async muteAlertInstance({
    ruleId,
    alertInstanceId,
    indices,
    logger,
  }: {
    ruleId: string;
    alertInstanceId: string;
    indices: string[];
    logger: Logger;
  }) {
    return this._updateMuteState({
      muted: true,
      targets: [{ ruleId, alertInstanceIds: [alertInstanceId] }],
      indices,
      logger,
    });
  }

  public async unmuteAlertInstance({
    ruleId,
    alertInstanceId,
    indices,
    logger,
  }: {
    ruleId: string;
    alertInstanceId: string;
    indices: string[];
    logger: Logger;
  }) {
    return this._updateMuteState({
      muted: false,
      targets: [{ ruleId, alertInstanceIds: [alertInstanceId] }],
      indices,
      logger,
    });
  }

  public async muteAllAlerts({
    ruleId,
    indices,
    logger,
  }: {
    ruleId: string;
    indices: string[];
    logger: Logger;
  }) {
    return this._updateMuteState({
      muted: true,
      targets: [{ ruleId }],
      indices,
      logger,
    });
  }

  public async unmuteAllAlerts({
    ruleId,
    indices,
    logger,
  }: {
    ruleId: string;
    indices: string[];
    logger: Logger;
  }) {
    return this._updateMuteState({
      muted: false,
      targets: [{ ruleId }],
      indices,
      logger,
    });
  }

  public async muteAlertInstances({
    targets,
    indices,
    logger,
  }: {
    targets: MuteInstances;
    indices: string[];
    logger: Logger;
  }) {
    return this._updateMuteState({
      muted: true,
      targets,
      indices,
      logger,
    });
  }

  public async unmuteAlertInstances({
    targets,
    indices,
    logger,
  }: {
    targets: MuteInstances;
    indices: string[];
    logger: Logger;
  }) {
    return this._updateMuteState({
      muted: false,
      targets,
      indices,
      logger,
    });
  }
}
