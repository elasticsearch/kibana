/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { type Observable, firstValueFrom, filter } from 'rxjs';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import type { PublicMethodsOf } from '@kbn/utility-types';
import {
  createConcreteWriteIndex,
  createOrUpdateComponentTemplate,
  createOrUpdateIlmPolicy,
  createOrUpdateIndexTemplate,
  DEFAULT_ALERTS_ILM_POLICY,
  DEFAULT_ALERTS_ILM_POLICY_NAME,
  ECS_COMPONENT_TEMPLATE_NAME,
  getIndexTemplate,
  installWithTimeout,
  TOTAL_FIELDS_LIMIT,
  type PublicFrameworkAlertsService,
  type DataStreamAdapter,
  VALID_ALERT_INDEX_PREFIXES,
} from '@kbn/alerting-plugin/server';
import { TECHNICAL_COMPONENT_TEMPLATE_NAME } from '../../common/assets';
import { technicalComponentTemplate } from '../../common/assets/component_templates/technical_component_template';
import { ecsComponentTemplate } from '../../common/assets/component_templates/ecs_component_template';
import type { IndexInfo } from './index_info';

interface ConstructorOptions {
  getResourceName(relativeName: string): string;
  getClusterClient: () => Promise<ElasticsearchClient>;
  logger: Logger;
  isWriteEnabled: boolean;
  disabledRegistrationContexts: string[];
  frameworkAlerts: PublicFrameworkAlertsService;
  pluginStop$: Observable<void>;
  dataStreamAdapter: DataStreamAdapter;
  elasticsearchAndSOAvailability$: Observable<boolean>;
}

export type IResourceInstaller = PublicMethodsOf<ResourceInstaller>;
export class ResourceInstaller {
  constructor(private readonly options: ConstructorOptions) {}

  /**
   * Field limit applied to all rule registry alerts-as-data resources. Sourced
   * from the alerting framework contract (`xpack.alerting.alertsService.totalFieldsLimit`)
   * so it stays in sync with the framework, falling back to `TOTAL_FIELDS_LIMIT`.
   */
  private getTotalFieldsLimit(): number {
    return this.options.frameworkAlerts.getTotalFieldsLimit?.() ?? TOTAL_FIELDS_LIMIT;
  }

  // -----------------------------------------------------------------------------------------------
  // Common resources

  /**
   * Installs common, library-level resources shared between all indices:
   *   - default ILM policy
   *   - component template containing technical fields
   *   - component template containing all standard ECS fields
   */
  public async installCommonResources(): Promise<void> {
    await firstValueFrom(
      this.options.elasticsearchAndSOAvailability$.pipe(
        filter((areESAndSOAvailable) => areESAndSOAvailable)
      )
    );
    const resourceDescription = 'common resources shared between all indices';
    const { logger, isWriteEnabled } = this.options;
    if (!isWriteEnabled) {
      logger.info(`Write is disabled; not installing ${resourceDescription}`);
      return;
    }

    await installWithTimeout({
      description: resourceDescription,
      logger,
      pluginStop$: this.options.pluginStop$,
      installFn: async () => {
        const { getClusterClient, frameworkAlerts } = this.options;
        const clusterClient = await getClusterClient();

        try {
          // We can install them in parallel
          await Promise.all([
            // Install ILM policy and ECS component template only if framework alerts are not enabled
            // If framework alerts are enabled, the alerting framework will install these
            ...(frameworkAlerts.enabled()
              ? []
              : [
                  createOrUpdateIlmPolicy({
                    logger,
                    esClient: clusterClient,
                    name: DEFAULT_ALERTS_ILM_POLICY_NAME,
                    policy: DEFAULT_ALERTS_ILM_POLICY,
                    dataStreamAdapter: this.options.dataStreamAdapter,
                  }),
                  createOrUpdateComponentTemplate({
                    logger,
                    esClient: clusterClient,
                    template: {
                      ...ecsComponentTemplate,
                      name: ECS_COMPONENT_TEMPLATE_NAME,
                    },
                    totalFieldsLimit: this.getTotalFieldsLimit(),
                  }),
                ]),
            createOrUpdateComponentTemplate({
              logger,
              esClient: clusterClient,
              template: {
                ...technicalComponentTemplate,
                name: TECHNICAL_COMPONENT_TEMPLATE_NAME,
              },
              totalFieldsLimit: this.getTotalFieldsLimit(),
            }),
          ]);
        } catch (err) {
          logger.error(
            `Error installing common resources in RuleRegistry ResourceInstaller - ${err.message}`
          );
          throw err;
        }
      },
    });
  }

  // -----------------------------------------------------------------------------------------------
  // Index-level resources

  /**
   * Installs index-level resources shared between all namespaces of this index:
   *   - custom ILM policy if it was provided
   *   - component templates
   */
  public async installIndexLevelResources(indexInfo: IndexInfo): Promise<void> {
    const resourceDescription = `resources for index ${indexInfo.baseName}`;
    const { logger, isWriteEnabled } = this.options;
    if (!isWriteEnabled) {
      logger.info(`Write is disabled; not installing ${resourceDescription}`);
      return;
    }

    await installWithTimeout({
      description: resourceDescription,
      logger,
      pluginStop$: this.options.pluginStop$,
      installFn: async () => {
        const { frameworkAlerts, getClusterClient } = this.options;
        const { componentTemplates, ilmPolicy, additionalPrefix } = indexInfo.indexOptions;
        const clusterClient = await getClusterClient();

        // Rule registry allows for installation of custom ILM policy, which is only
        // used by security preview indices. We will continue to let rule registry
        // handle this installation.
        if (ilmPolicy != null) {
          await createOrUpdateIlmPolicy({
            logger,
            esClient: clusterClient,
            name: indexInfo.getIlmPolicyName(),
            policy: ilmPolicy,
            dataStreamAdapter: this.options.dataStreamAdapter,
          });
        }

        // Rule registry allows for installation of resources with an additional prefix,
        // which is only used by security preview indices. We will continue to let rule registry
        // handle installation of these resources.
        if (!frameworkAlerts.enabled() || additionalPrefix) {
          await Promise.all(
            componentTemplates.map(async (ct) => {
              await createOrUpdateComponentTemplate({
                logger,
                esClient: clusterClient,
                template: {
                  name: indexInfo.getComponentTemplateName(ct.name),
                  template: {
                    settings: ct.settings ?? {},
                    mappings: ct.mappings,
                  },
                  _meta: ct._meta,
                },
                totalFieldsLimit: this.getTotalFieldsLimit(),
              });
            })
          );
        }
      },
    });
  }

  // -----------------------------------------------------------------------------------------------
  // Namespace-level resources

  /**
   * Installs and updates resources tied to concrete namespace of an index:
   *   - namespaced index template
   *   - Index mappings for existing concrete indices
   *   - concrete index (write target) if it doesn't exist
   */
  public async installAndUpdateNamespaceLevelResources(
    indexInfo: IndexInfo,
    namespace: string
  ): Promise<void> {
    const { logger, frameworkAlerts, getClusterClient } = this.options;
    const clusterClient = await getClusterClient();

    const alias = indexInfo.getPrimaryAlias(namespace);

    if (!indexInfo.indexOptions.additionalPrefix && frameworkAlerts.enabled()) {
      const { result: initialized, error } = await frameworkAlerts.getContextInitializationPromise(
        indexInfo.indexOptions.registrationContext,
        namespace
      );

      if (!initialized) {
        throw new Error(
          `There was an error in the framework installing namespace-level resources and creating concrete indices for ${alias} - ${error}`
        );
      } else {
        return;
      }
    }

    logger.info(`Installing namespace-level resources and creating concrete index for ${alias}`);

    const secondaryNamespacedAlias = indexInfo.getSecondaryAlias(namespace);
    const indexPatterns = {
      basePattern: indexInfo.basePattern,
      pattern: indexInfo.getPatternForBackingIndices(namespace),
      alias: indexInfo.getPrimaryAlias(namespace),
      name: indexInfo.getConcreteIndexInitialName(namespace),
      template: indexInfo.getIndexTemplateName(namespace),
      validPrefixes: VALID_ALERT_INDEX_PREFIXES,
      ...(secondaryNamespacedAlias ? { secondaryAlias: secondaryNamespacedAlias } : {}),
    };

    const technicalComponentNames = [TECHNICAL_COMPONENT_TEMPLATE_NAME];
    const ownComponentNames = indexInfo.indexOptions.componentTemplates.map((template) =>
      indexInfo.getComponentTemplateName(template.name)
    );
    // Order matters:
    // - first go external component templates referenced by this index (e.g. the common full ECS template)
    // - then we include own component templates registered with this index
    // - finally, we include technical component templates to make sure the index gets all the
    //   mappings and settings required by all Kibana plugins using rule registry to work properly
    const componentTemplateRefs = [
      ...indexInfo.indexOptions.componentTemplateRefs,
      ...ownComponentNames,
      ...technicalComponentNames,
    ];

    const ilmPolicyName = await this.getIlmPolicyName(indexInfo);

    // Install / update the index template
    await createOrUpdateIndexTemplate({
      logger: this.options.logger,
      esClient: clusterClient,
      template: getIndexTemplate({
        componentTemplateRefs,
        ilmPolicyName: ilmPolicyName ? ilmPolicyName : DEFAULT_ALERTS_ILM_POLICY_NAME,
        indexPatterns,
        kibanaVersion: indexInfo.kibanaVersion,
        namespace,
        totalFieldsLimit: this.getTotalFieldsLimit(),
        dataStreamAdapter: this.options.dataStreamAdapter,
      }),
    });

    await createConcreteWriteIndex({
      logger: this.options.logger,
      esClient: clusterClient,
      totalFieldsLimit: this.getTotalFieldsLimit(),
      indexPatterns,
      dataStreamAdapter: this.options.dataStreamAdapter,
    });
  }

  private async getIlmPolicyName(indexInfo: IndexInfo): Promise<string | undefined> {
    const ilmPolicyName = indexInfo.getIlmPolicyName();
    const isCustomIlmPolicyName = ilmPolicyName !== DEFAULT_ALERTS_ILM_POLICY_NAME;

    if (!isCustomIlmPolicyName) {
      return undefined;
    }

    // If it is a custom, ensure that it exists
    try {
      const clusterClient = await this.options.getClusterClient();
      await clusterClient.ilm.getLifecycle({ name: ilmPolicyName });

      return ilmPolicyName;
    } catch (err) {
      this.options.logger.error(
        `ILM policy ${ilmPolicyName} not found, using default ${DEFAULT_ALERTS_ILM_POLICY_NAME} policy instead`
      );
      return undefined;
    }
  }
}
