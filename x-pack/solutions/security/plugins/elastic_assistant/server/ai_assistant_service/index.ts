/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FieldMap } from '@kbn/data-stream-adapter';
import { DataStreamSpacesAdapter } from '@kbn/data-stream-adapter';
import { DEFAULT_NAMESPACE_STRING } from '@kbn/core-saved-objects-utils-server';
import type {
  AuthenticatedUser,
  Logger,
  ElasticsearchClient,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import type { Subject } from 'rxjs';
import type { LicensingApiRequestHandlerContext } from '@kbn/licensing-plugin/server';
import type { ProductDocBaseStartContract } from '@kbn/product-doc-base-plugin/server';
import type {
  IndicesIndexSettings,
  IndicesSimulateTemplateResponse,
} from '@elastic/elasticsearch/lib/api/types';
import { omit, some } from 'lodash';
import type { InstallationStatus } from '@kbn/product-doc-base-plugin/common/install_status';
import type { TrainedModelsProvider } from '@kbn/ml-plugin/server/shared_services/providers';
import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import { IndexPatternAdapter } from '@kbn/index-adapter';
import { ElasticSearchSaver } from '@kbn/langgraph-checkpoint-saver/server/elastic-search-checkpoint-saver';
import type { AnonymizationFieldResponse } from '@kbn/elastic-assistant-common';
import type { ESSearchRequest } from '@kbn/es-types';
import {
  AttackDiscoveryScheduleDataClient,
  type CreateAttackDiscoveryScheduleDataClientParams,
} from '@kbn/attack-discovery-schedules-common';
import { alertSummaryFieldsFieldMap } from '../ai_assistant_data_clients/alert_summary/field_maps_configuration';
import { defendInsightsFieldMap } from '../lib/defend_insights/persistence/field_maps_configuration';
import { getDefaultAnonymizationFields } from '../../common/anonymization';
import type { AssistantResourceNames, GetElser } from '../types';
import type { GetAIAssistantConversationsDataClientParams } from '../ai_assistant_data_clients/conversations';
import { AIAssistantConversationsDataClient } from '../ai_assistant_data_clients/conversations';
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
  conversationsAssistantInterruptsFieldMap,
  conversationsFieldMap,
} from '../ai_assistant_data_clients/conversations/field_maps_configuration';
import { assistantPromptsFieldMap } from '../ai_assistant_data_clients/prompts/field_maps_configuration';
import { assistantAnonymizationFieldsFieldMap } from '../ai_assistant_data_clients/anonymization_fields/field_maps_configuration';
import { AIAssistantDataClient } from '../ai_assistant_data_clients';
import {
  ASSISTANT_ELSER_INFERENCE_ID,
  knowledgeBaseFieldMap,
} from '../ai_assistant_data_clients/knowledge_base/field_maps_configuration';
import type { GetAIAssistantKnowledgeBaseDataClientParams } from '../ai_assistant_data_clients/knowledge_base';
import {
  AIAssistantKnowledgeBaseDataClient,
  ensureDedicatedInferenceEndpoint,
} from '../ai_assistant_data_clients/knowledge_base';
import { AttackDiscoveryDataClient } from '../lib/attack_discovery/persistence';
import { DefendInsightsDataClient } from '../lib/defend_insights/persistence';
import { createGetElserId, ensureProductDocumentationInstalled } from './helpers';
import { hasAIAssistantLicense } from '../routes/helpers';
import {
  ANONYMIZATION_FIELDS_COMPONENT_TEMPLATE,
  ANONYMIZATION_FIELDS_INDEX_PATTERN,
  ANONYMIZATION_FIELDS_INDEX_TEMPLATE,
  ANONYMIZATION_FIELDS_RESOURCE,
} from './constants';
import { getIndexTemplateAndPattern } from '../lib/data_stream/helpers';

const TOTAL_FIELDS_LIMIT = 2500;

export function getResourceName(resource: string) {
  return `.kibana-elastic-ai-assistant-${resource}`;
}

export interface AIAssistantServiceOpts {
  logger: Logger;
  kibanaVersion: string;
  elserInferenceId?: string;
  elasticsearchClientPromise: Promise<ElasticsearchClient>;
  soClientPromise: Promise<SavedObjectsClientContract>;
  ml: MlPluginSetup;
  taskManager: TaskManagerSetupContract;
  pluginStop$: Subject<void>;
  productDocManager: Promise<ProductDocBaseStartContract['management']>;
  adhocAttackDiscoveryDataClient: IRuleDataClient;
}

export interface CreateAIAssistantClientParams {
  logger: Logger;
  spaceId: string;
  currentUser: AuthenticatedUser | null;
  licensing: Promise<LicensingApiRequestHandlerContext>;
}

export type CreateDataStream = (params: {
  resource:
    | 'anonymizationFields'
    | 'conversations'
    | 'knowledgeBase'
    | 'prompts'
    | 'defendInsights'
    | 'alertSummary';
  fieldMap: FieldMap;
  kibanaVersion: string;
  spaceId?: string;
  settings?: IndicesIndexSettings;
  writeIndexOnly?: boolean;
}) => DataStreamSpacesAdapter;

export type CreateIndexPattern = (params: {
  resource: 'checkpoints' | 'checkpointWrites';
  fieldMap: FieldMap;
  kibanaVersion: string;
  spaceId?: string;
  settings?: IndicesIndexSettings;
  writeIndexOnly?: boolean;
}) => IndexPatternAdapter;

export class AIAssistantService {
  private initialized: boolean;
  private isInitializing: boolean = false;
  private getElserId: GetElser;
  private elserInferenceId?: string;
  private conversationsDataStream: DataStreamSpacesAdapter;
  private knowledgeBaseDataStream: DataStreamSpacesAdapter;
  private promptsDataStream: DataStreamSpacesAdapter;
  private alertSummaryDataStream: DataStreamSpacesAdapter;
  private anonymizationFieldsDataStream: DataStreamSpacesAdapter;
  private defendInsightsDataStream: DataStreamSpacesAdapter;
  private checkpointsDataStream: IndexPatternAdapter;
  private checkpointWritesDataStream: IndexPatternAdapter;
  private resourceInitializationHelper: ResourceInstallationHelper;
  private initPromise: Promise<InitializationPromise>;
  private isKBSetupInProgress: Map<string, boolean> = new Map();
  private hasInitializedV2KnowledgeBase: boolean = false;
  private productDocManager?: ProductDocBaseStartContract['management'];
  private isProductDocumentationInProgress: boolean = false;
  private isCheckpointSaverEnabled: boolean = false;
  // Temporary 'feature flag' to determine if we should initialize the assistant interrupts mappings.
  private assistantInterruptsEnabled: boolean = false;
  private assistantInterruptsInitialized: boolean = false;

  constructor(private readonly options: AIAssistantServiceOpts) {
    this.initialized = false;
    this.getElserId = createGetElserId(options.ml.trainedModelsProvider);
    this.elserInferenceId = options.elserInferenceId;

    this.conversationsDataStream = this.createDataStream({
      resource: 'conversations',
      kibanaVersion: options.kibanaVersion,
      fieldMap: conversationsFieldMap,
    });
    this.knowledgeBaseDataStream = this.createDataStream({
      resource: 'knowledgeBase',
      kibanaVersion: options.kibanaVersion,
      fieldMap: knowledgeBaseFieldMap,
    });
    this.promptsDataStream = this.createDataStream({
      resource: 'prompts',
      kibanaVersion: options.kibanaVersion,
      fieldMap: assistantPromptsFieldMap,
    });
    this.anonymizationFieldsDataStream = this.createDataStream({
      resource: 'anonymizationFields',
      kibanaVersion: options.kibanaVersion,
      fieldMap: assistantAnonymizationFieldsFieldMap,
    });
    this.defendInsightsDataStream = this.createDataStream({
      resource: 'defendInsights',
      kibanaVersion: options.kibanaVersion,
      fieldMap: defendInsightsFieldMap,
    });
    this.alertSummaryDataStream = this.createDataStream({
      resource: 'alertSummary',
      kibanaVersion: options.kibanaVersion,
      fieldMap: alertSummaryFieldsFieldMap,
    });

    this.checkpointsDataStream = this.createIndexPattern({
      resource: 'checkpoints',
      kibanaVersion: options.kibanaVersion,
      fieldMap: ElasticSearchSaver.checkpointsFieldMap,
    });
    this.checkpointWritesDataStream = this.createIndexPattern({
      resource: 'checkpointWrites',
      kibanaVersion: options.kibanaVersion,
      fieldMap: ElasticSearchSaver.checkpointWritesFieldMap,
    });

    this.initPromise = this.initializeResources();

    this.resourceInitializationHelper = createResourceInstallationHelper(
      this.options.logger,
      this.initPromise,
      this.installAndUpdateSpaceLevelResources.bind(this)
    );
    options.productDocManager
      .then((productDocManager) => {
        this.productDocManager = productDocManager;
      })
      .catch((error) => {
        this.options.logger.warn(`Failed to initialize productDocManager: ${error.message}`);
      });
  }

  public getIsCheckpointSaverEnabled() {
    return this.isCheckpointSaverEnabled;
  }

  public setIsCheckpointSaverEnabled(isEnabled: boolean) {
    this.isCheckpointSaverEnabled = isEnabled;
  }

  public isInitialized() {
    return this.initialized;
  }

  public getIsKBSetupInProgress(spaceId: string) {
    return this.isKBSetupInProgress.get(spaceId) ?? false;
  }

  public setIsKBSetupInProgress(spaceId: string, isInProgress: boolean) {
    this.isKBSetupInProgress.set(spaceId, isInProgress);
  }

  public getIsProductDocumentationInProgress() {
    return this.isProductDocumentationInProgress;
  }

  public setIsProductDocumentationInProgress(isInProgress: boolean) {
    this.isProductDocumentationInProgress = isInProgress;
  }

  private createIndexPattern: CreateIndexPattern = ({
    resource,
    kibanaVersion,
    fieldMap,
    settings,
    writeIndexOnly,
  }) => {
    const newIndexPattern = new IndexPatternAdapter(this.resourceNames.aliases[resource], {
      kibanaVersion,
      totalFieldsLimit: TOTAL_FIELDS_LIMIT,
      writeIndexOnly,
    });

    newIndexPattern.setComponentTemplate({
      name: this.resourceNames.componentTemplate[resource],
      fieldMap,
      settings,
    });

    newIndexPattern.setIndexTemplate({
      name: this.resourceNames.indexTemplate[resource],
      componentTemplateRefs: [this.resourceNames.componentTemplate[resource]],
      // Apply `default_pipeline` if pipeline exists for resource
      ...(resource in this.resourceNames.pipelines && {
        template: {
          settings: {
            'index.default_pipeline':
              this.resourceNames.pipelines[resource as keyof typeof this.resourceNames.pipelines],
          },
        },
      }),
    });

    return newIndexPattern;
  };

  private createDataStream: CreateDataStream = ({
    resource,
    kibanaVersion,
    fieldMap,
    settings,
    writeIndexOnly,
  }) => {
    const newDataStream = new DataStreamSpacesAdapter(this.resourceNames.aliases[resource], {
      kibanaVersion,
      totalFieldsLimit: TOTAL_FIELDS_LIMIT,
      writeIndexOnly,
    });

    newDataStream.setComponentTemplate({
      name: this.resourceNames.componentTemplate[resource],
      fieldMap,
      settings,
    });

    newDataStream.setIndexTemplate({
      name: this.resourceNames.indexTemplate[resource],
      componentTemplateRefs: [this.resourceNames.componentTemplate[resource]],
      // Apply `default_pipeline` if pipeline exists for resource
      ...(resource in this.resourceNames.pipelines &&
      // Remove this param and initialization when the `assistantKnowledgeBaseByDefault` feature flag is removed
      !(resource === 'knowledgeBase')
        ? {
            template: {
              settings: {
                'index.default_pipeline':
                  this.resourceNames.pipelines[
                    resource as keyof typeof this.resourceNames.pipelines
                  ],
              },
            },
          }
        : {}),
    });

    return newDataStream;
  };

  private async rolloverDataStream(
    initialInferenceEndpointId: string,
    targetInferenceEndpointId: string
  ): Promise<DataStreamSpacesAdapter> {
    const esClient = await this.options.elasticsearchClientPromise;

    const currentDataStream = this.createDataStream({
      resource: 'knowledgeBase',
      kibanaVersion: this.options.kibanaVersion,
      fieldMap: {
        ...omit(knowledgeBaseFieldMap, 'semantic_text'),
        semantic_text: {
          type: 'semantic_text',
          array: false,
          required: false,
          inference_id: initialInferenceEndpointId,
          search_inference_id: targetInferenceEndpointId,
        },
      },
    });

    // Add `search_inference_id` to the existing mappings
    await currentDataStream.install({
      esClient,
      logger: this.options.logger,
      pluginStop$: this.options.pluginStop$,
    });

    // Migrate data stream mapping to the default inference_id
    const newDS = this.createDataStream({
      resource: 'knowledgeBase',
      kibanaVersion: this.options.kibanaVersion,
      fieldMap: {
        ...omit(knowledgeBaseFieldMap, ['semantic_text', 'vector', 'vector.tokens']),
        semantic_text: {
          type: 'semantic_text',
          array: false,
          required: false,
          ...(targetInferenceEndpointId !== defaultInferenceEndpoints.ELSER
            ? { inference_id: targetInferenceEndpointId }
            : {}),
        },
      },
      settings: {
        // force new semantic_text field behavior
        'index.mapping.semantic_text.use_legacy_format': false,
      },
      writeIndexOnly: true,
    });

    // We need to first install the templates and then rollover the indices
    await newDS.installTemplates({
      esClient,
      logger: this.options.logger,
      pluginStop$: this.options.pluginStop$,
    });

    const indexNames = (
      await esClient.indices.getDataStream({ name: newDS.name })
    ).data_streams.map((ds) => ds.name);

    try {
      await Promise.all(
        indexNames.map((indexName) => esClient.indices.rollover({ alias: indexName }))
      );
    } catch (e) {
      /* empty */
    }

    return newDS;
  }

  private async initializeResources(): Promise<InitializationPromise> {
    this.isInitializing = true;
    try {
      this.options.logger.debug(`Initializing resources for AIAssistantService`);
      const esClient = await this.options.elasticsearchClientPromise;

      if (this.productDocManager) {
        // install product documentation without blocking other resources
        void ensureProductDocumentationInstalled({
          esClient,
          productDocManager: this.productDocManager,
          logger: this.options.logger,
          setIsProductDocumentationInProgress: this.setIsProductDocumentationInProgress.bind(this),
        });
      }

      // If assistantInterruptsEnabled is true, re-install data stream resources for new mappings if it has not been done already
      if (this.assistantInterruptsEnabled && !this.assistantInterruptsInitialized) {
        this.options.logger.debug(`Creating conversation datastream with assistant interrupts`);
        this.conversationsDataStream = this.createDataStream({
          resource: 'conversations',
          kibanaVersion: this.options.kibanaVersion,
          fieldMap: conversationsAssistantInterruptsFieldMap,
        });
        this.assistantInterruptsInitialized = true;
      }

      await this.conversationsDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      const knowledgeBaseDataSteams = (
        await esClient.indices.getDataStream({
          name: this.knowledgeBaseDataStream.name,
        })
      )?.data_streams;

      let mappings: IndicesSimulateTemplateResponse[] = [];
      try {
        mappings = await Promise.all(
          knowledgeBaseDataSteams.map((ds) =>
            esClient.indices.simulateTemplate({
              name: ds.template,
            })
          )
        );
      } catch (error) {
        /* empty */
      }

      const isUsingDedicatedInferenceEndpoint = some(
        mappings,
        (value) =>
          (value?.template?.mappings?.properties?.semantic_text as { inference_id: string })
            ?.inference_id === ASSISTANT_ELSER_INFERENCE_ID
      );

      if (isUsingDedicatedInferenceEndpoint) {
        this.knowledgeBaseDataStream = await this.rolloverDataStream(
          ASSISTANT_ELSER_INFERENCE_ID,
          defaultInferenceEndpoints.ELSER
        );
      } else {
        // We need to make sure that the data stream is created with the correct mappings
        this.knowledgeBaseDataStream = this.createDataStream({
          resource: 'knowledgeBase',
          kibanaVersion: this.options.kibanaVersion,
          fieldMap: {
            ...omit(knowledgeBaseFieldMap, ['semantic_text', 'vector', 'vector.tokens']),
            semantic_text: {
              type: 'semantic_text',
              array: false,
              required: false,
              ...(this.elserInferenceId ? { inference_id: this.elserInferenceId } : {}),
            },
          },
          writeIndexOnly: true,
        });
      }

      const soClient = await this.options.soClientPromise;

      await ensureDedicatedInferenceEndpoint({
        elserId: await this.getElserId(),
        esClient,
        getTrainedModelsProvider: () =>
          this.options.ml.trainedModelsProvider({} as KibanaRequest, soClient),
        logger: this.options.logger,
        index: this.knowledgeBaseDataStream.name,
      });

      await this.knowledgeBaseDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      await this.promptsDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      await this.anonymizationFieldsDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      await this.defendInsightsDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      await this.alertSummaryDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      await this.checkpointsDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });

      await this.checkpointWritesDataStream.install({
        esClient,
        logger: this.options.logger,
        pluginStop$: this.options.pluginStop$,
      });
    } catch (error) {
      this.options.logger.warn(`Error initializing AI assistant resources: ${error.message}`);
      this.initialized = false;
      this.isInitializing = false;
      return errorResult(error.message);
    }
    this.initialized = true;
    this.isInitializing = false;
    return successResult();
  }

  private readonly resourceNames: AssistantResourceNames = {
    componentTemplate: {
      alertSummary: getResourceName('component-template-alert-summary'),
      conversations: getResourceName('component-template-conversations'),
      knowledgeBase: getResourceName('component-template-knowledge-base'),
      prompts: getResourceName('component-template-prompts'),
      anonymizationFields: getResourceName(ANONYMIZATION_FIELDS_COMPONENT_TEMPLATE),
      defendInsights: getResourceName('component-template-defend-insights'),
      checkpoints: getResourceName('component-template-checkpoints'),
      checkpointWrites: getResourceName('component-template-checkpoint-writes'),
    },
    aliases: {
      alertSummary: getResourceName('alert-summary'),
      conversations: getResourceName('conversations'),
      knowledgeBase: getResourceName('knowledge-base'),
      prompts: getResourceName('prompts'),
      anonymizationFields: getResourceName(ANONYMIZATION_FIELDS_RESOURCE),
      defendInsights: getResourceName('defend-insights'),
      checkpoints: getResourceName('checkpoints'),
      checkpointWrites: getResourceName('checkpoint-writes'),
    },
    indexPatterns: {
      alertSummary: getResourceName('alert-summary*'),
      conversations: getResourceName('conversations*'),
      knowledgeBase: getResourceName('knowledge-base*'),
      prompts: getResourceName('prompts*'),
      anonymizationFields: getResourceName(ANONYMIZATION_FIELDS_INDEX_PATTERN),
      defendInsights: getResourceName('defend-insights*'),
      checkpoints: getResourceName('checkpoints*'),
      checkpointWrites: getResourceName('checkpoint-writes*'),
    },
    indexTemplate: {
      alertSummary: getResourceName('index-template-alert-summary'),
      conversations: getResourceName('index-template-conversations'),
      knowledgeBase: getResourceName('index-template-knowledge-base'),
      prompts: getResourceName('index-template-prompts'),
      anonymizationFields: getResourceName(ANONYMIZATION_FIELDS_INDEX_TEMPLATE),
      defendInsights: getResourceName('index-template-defend-insights'),
      checkpoints: getResourceName('index-template-checkpoints'),
      checkpointWrites: getResourceName('index-template-checkpoint-writes'),
    },
    pipelines: {
      knowledgeBase: getResourceName('ingest-pipeline-knowledge-base'),
    },
  };

  private async checkResourcesInstallation(opts: CreateAIAssistantClientParams) {
    const licensing = await opts.licensing;
    if (!hasAIAssistantLicense(licensing.license)) return null;
    // Check if resources installation has succeeded
    const { result: initialized, error } = await this.getSpaceResourcesInitializationPromise(
      opts.spaceId
    );

    // If space level resources initialization failed, retry
    if (!initialized && error) {
      let initRetryPromise: Promise<InitializationPromise> | undefined;

      // If !this.initialized, we know that resource initialization failed
      // and we need to retry this before retrying the spaceId specific resources
      if (!this.initialized) {
        if (!this.isInitializing) {
          this.options.logger.info(`Retrying common resource initialization`);
          initRetryPromise = this.initializeResources();
        } else {
          this.options.logger.info(
            `Skipped retrying common resource initialization because it is already being retried.`
          );
        }
      }

      this.resourceInitializationHelper.retry(opts.spaceId, initRetryPromise);

      const retryResult = await this.resourceInitializationHelper.getInitializedResources(
        opts.spaceId ?? DEFAULT_NAMESPACE_STRING
      );

      if (!retryResult.result) {
        const errorLogPrefix = `There was an error in the framework installing spaceId-level resources and creating concrete indices for spaceId "${opts.spaceId}" - `;
        // Retry also failed
        this.options.logger.warn(
          retryResult.error && error
            ? `${errorLogPrefix}Retry failed with errors: ${error}`
            : `${errorLogPrefix}Original error: ${error}; Error after retry: ${retryResult.error}`
        );
        return null;
      } else {
        this.options.logger.info(
          `Resource installation for "${opts.spaceId}" succeeded after retry`
        );
      }
    }
  }

  public async getProductDocumentationStatus(): Promise<InstallationStatus> {
    const status = await this.productDocManager?.getStatus({
      inferenceId: defaultInferenceEndpoints.ELSER,
    });

    if (!status) {
      return 'uninstalled';
    }

    return this.isProductDocumentationInProgress ? 'installing' : status.status;
  }

  public async createAIAssistantConversationsDataClient(
    opts: CreateAIAssistantClientParams & GetAIAssistantConversationsDataClientParams
  ): Promise<AIAssistantConversationsDataClient | null> {
    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    // Note: Due to plugin lifecycle and feature flag registration timing, we need to pass in the feature flag her
    if (opts.assistantInterruptsEnabled) {
      this.assistantInterruptsEnabled = true;
    }

    /**
     * Initialize the assistant interrupts mappings if they are not already initialized.
     */
    if (this.assistantInterruptsEnabled && !this.assistantInterruptsInitialized) {
      await this.initializeResources();
    }

    return new AIAssistantConversationsDataClient({
      logger: this.options.logger,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      spaceId: opts.spaceId,
      kibanaVersion: this.options.kibanaVersion,
      indexPatternsResourceName: this.resourceNames.aliases.conversations,
      currentUser: opts.currentUser,
    });
  }

  public async createCheckpointSaver(opts: CreateAIAssistantClientParams) {
    const esClient = await this.options.elasticsearchClientPromise;
    const checkpointIndex = getIndexTemplateAndPattern(
      this.resourceNames.aliases.checkpoints,
      opts.spaceId
    ).alias;
    const checkpointWritesIndex = getIndexTemplateAndPattern(
      this.resourceNames.aliases.checkpointWrites,
      opts.spaceId
    ).alias;

    const elasticSearchSaver = new ElasticSearchSaver({
      client: esClient,
      checkpointIndex,
      checkpointWritesIndex,
      logger: this.options.logger,
    });
    return elasticSearchSaver;
  }

  public async createAIAssistantKnowledgeBaseDataClient(
    opts: CreateAIAssistantClientParams &
      GetAIAssistantKnowledgeBaseDataClientParams & {
        getTrainedModelsProvider: () => ReturnType<TrainedModelsProvider['trainedModelsProvider']>;
      }
  ): Promise<AIAssistantKnowledgeBaseDataClient | null> {
    // If a V2 KnowledgeBase has never been initialized we need to reinitialize all persistence resources to make sure
    // they're using the correct model/mappings. Technically all existing KB data is stale since it was created
    // with a different model/mappings.
    // Added hasInitializedV2KnowledgeBase to prevent the console noise from re-init on each KB request
    if (!this.hasInitializedV2KnowledgeBase) {
      await this.initializeResources();
      this.hasInitializedV2KnowledgeBase = true;
    }

    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    return new AIAssistantKnowledgeBaseDataClient({
      logger: this.options.logger.get('knowledgeBase'),
      currentUser: opts.currentUser,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      indexPatternsResourceName: this.resourceNames.aliases.knowledgeBase,
      ingestPipelineResourceName: this.resourceNames.pipelines.knowledgeBase,
      getElserId: this.getElserId,
      getIsKBSetupInProgress: this.getIsKBSetupInProgress.bind(this),
      getProductDocumentationStatus: this.getProductDocumentationStatus.bind(this),
      kibanaVersion: this.options.kibanaVersion,
      ml: this.options.ml,
      elserInferenceId: this.options.elserInferenceId,
      setIsKBSetupInProgress: this.setIsKBSetupInProgress.bind(this),
      spaceId: opts.spaceId,
      manageGlobalKnowledgeBaseAIAssistant: opts.manageGlobalKnowledgeBaseAIAssistant ?? false,
      getTrainedModelsProvider: opts.getTrainedModelsProvider,
    });
  }

  public async createAttackDiscoveryDataClient(
    opts: CreateAIAssistantClientParams & {
      adhocAttackDiscoveryDataClient: IRuleDataClient | undefined;
    }
  ): Promise<AttackDiscoveryDataClient | null> {
    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    return new AttackDiscoveryDataClient({
      adhocAttackDiscoveryDataClient: opts.adhocAttackDiscoveryDataClient,
      logger: this.options.logger.get('attackDiscovery'),
      currentUser: opts.currentUser,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      indexPatternsResourceName: '',
      kibanaVersion: this.options.kibanaVersion,
      spaceId: opts.spaceId,
    });
  }

  public async createAttackDiscoverySchedulingDataClient(
    opts: CreateAttackDiscoveryScheduleDataClientParams
  ): Promise<AttackDiscoveryScheduleDataClient | null> {
    return new AttackDiscoveryScheduleDataClient({
      actionsClient: opts.actionsClient,
      filterTags: opts.filterTags,
      logger: opts.logger,
      rulesClient: opts.rulesClient,
    });
  }

  public async createDefendInsightsDataClient(
    opts: CreateAIAssistantClientParams
  ): Promise<DefendInsightsDataClient | null> {
    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    return new DefendInsightsDataClient({
      logger: this.options.logger.get('defendInsights'),
      currentUser: opts.currentUser,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      indexPatternsResourceName: this.resourceNames.aliases.defendInsights,
      kibanaVersion: this.options.kibanaVersion,
      spaceId: opts.spaceId,
    });
  }

  public async createAIAssistantPromptsDataClient(
    opts: CreateAIAssistantClientParams
  ): Promise<AIAssistantDataClient | null> {
    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    return new AIAssistantDataClient({
      logger: this.options.logger,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      spaceId: opts.spaceId,
      kibanaVersion: this.options.kibanaVersion,
      indexPatternsResourceName: this.resourceNames.aliases.prompts,
      currentUser: opts.currentUser,
    });
  }

  public async createAlertSummaryDataClient(
    opts: CreateAIAssistantClientParams
  ): Promise<AIAssistantDataClient | null> {
    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    return new AIAssistantDataClient({
      logger: this.options.logger,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      spaceId: opts.spaceId,
      kibanaVersion: this.options.kibanaVersion,
      indexPatternsResourceName: this.resourceNames.aliases.alertSummary,
      currentUser: opts.currentUser,
    });
  }

  public async createAIAssistantAnonymizationFieldsDataClient(
    opts: CreateAIAssistantClientParams
  ): Promise<AIAssistantDataClient | null> {
    const res = await this.checkResourcesInstallation(opts);

    if (res === null) {
      return null;
    }

    return new AIAssistantDataClient({
      logger: this.options.logger,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      spaceId: opts.spaceId,
      kibanaVersion: this.options.kibanaVersion,
      indexPatternsResourceName: this.resourceNames.aliases.anonymizationFields,
      currentUser: opts.currentUser,
    });
  }

  public async getSpaceResourcesInitializationPromise(
    spaceId: string | undefined = DEFAULT_NAMESPACE_STRING
  ): Promise<InitializationPromise> {
    const result = await this.resourceInitializationHelper.getInitializedResources(spaceId);
    // If the spaceId is unrecognized and spaceId is not the default, we
    // need to kick off resource installation and return the promise
    if (
      result.error &&
      result.error.includes(`Unrecognized spaceId`) &&
      spaceId !== DEFAULT_NAMESPACE_STRING
    ) {
      this.resourceInitializationHelper.add(spaceId);
      return this.resourceInitializationHelper.getInitializedResources(spaceId);
    }
    return result;
  }

  private async installAndUpdateSpaceLevelResources(
    spaceId: string | undefined = DEFAULT_NAMESPACE_STRING
  ) {
    try {
      this.options.logger.debug(`Initializing spaceId level resources for AIAssistantService`);
      const conversationsIndexName = await this.conversationsDataStream.getInstalledSpaceName(
        spaceId
      );
      if (!conversationsIndexName) {
        await this.conversationsDataStream.installSpace(spaceId);
      }

      const knowledgeBaseIndexName = await this.knowledgeBaseDataStream.getInstalledSpaceName(
        spaceId
      );
      if (!knowledgeBaseIndexName) {
        await this.knowledgeBaseDataStream.installSpace(spaceId);
      }

      const promptsIndexName = await this.promptsDataStream.getInstalledSpaceName(spaceId);
      if (!promptsIndexName) {
        await this.promptsDataStream.installSpace(spaceId);
      }

      const anonymizationFieldsIndexName =
        await this.anonymizationFieldsDataStream.getInstalledSpaceName(spaceId);

      if (!anonymizationFieldsIndexName) {
        await this.anonymizationFieldsDataStream.installSpace(spaceId);
        await this.createDefaultAnonymizationFields(spaceId);
      }
      const alertSummaryIndexName = await this.alertSummaryDataStream.getInstalledSpaceName(
        spaceId
      );
      if (!alertSummaryIndexName) {
        await this.alertSummaryDataStream.installSpace(spaceId);
      }

      // Ensure the ad-hoc Attack Discovery alerts index exists for the default space so the Attacks
      // data view (which references it) doesn't 404 the options-list `status` control before
      // the first ad-hoc attack is ever written. getWriter() installs the concrete index as a
      // side effect and writes no documents.
      if (spaceId === DEFAULT_NAMESPACE_STRING) {
        try {
          await this.options.adhocAttackDiscoveryDataClient.getWriter({ namespace: spaceId });
        } catch (e: unknown) {
          // e.g. RuleDataWriteDisabledError when xpack.ruleRegistry.write.enabled=false — the index
          // legitimately cannot exist in that config; log and continue rather than aborting space init.
          const errorMessage = e instanceof Error ? e.message : String(e);
          this.options.logger.warn(
            `Unable to pre-create ad-hoc Attack Discovery index for space "${spaceId}": ${errorMessage}`
          );
        }
      }

      const checkpointsIndexName = await this.checkpointsDataStream.getInstalledIndexName(spaceId);
      if (!checkpointsIndexName) {
        await this.checkpointsDataStream.createIndex(spaceId);
      }

      const checkpointWritesIndexName = await this.checkpointWritesDataStream.getInstalledIndexName(
        spaceId
      );
      if (!checkpointWritesIndexName) {
        await this.checkpointWritesDataStream.createIndex(spaceId);
      }
    } catch (error) {
      this.options.logger.warn(
        `Error initializing AI assistant namespace level resources: ${error.message}`
      );
      throw error;
    }
  }

  public async createDefaultAnonymizationFields(spaceId: string): Promise<void> {
    const dataClient = new AIAssistantDataClient({
      logger: this.options.logger,
      elasticsearchClientPromise: this.options.elasticsearchClientPromise,
      spaceId,
      kibanaVersion: this.options.kibanaVersion,
      indexPatternsResourceName: this.resourceNames.aliases.anonymizationFields,
      currentUser: null,
    });

    const defaultAnonymizationFields = getDefaultAnonymizationFields(spaceId);
    // ElasticSearch query to returns all default anonymization fields that exist in the environment
    const defaultAnonymizationFieldsQuery = {
      terms: { field: defaultAnonymizationFields.map((field) => field.field) },
    };

    // It only contains default anonymization fields that are stored in the environment.
    // It does not contain fields created by the user that are not present in defaultAnonymizationFields array.
    // If a user created a field with the same name as a default anonymization field, it will be returned in the response.
    const existingAnonymizationFieldsResponse = await (
      await dataClient?.getReader()
    ).search<ESSearchRequest, AnonymizationFieldResponse>({
      size: defaultAnonymizationFields.length,
      allow_no_indices: true,
      query: defaultAnonymizationFieldsQuery,
    });

    // Verify if the stored default anonymization fields in the environment count is equal to DefaultAnonymizationFields array length.
    if (
      existingAnonymizationFieldsResponse.hits.total.value !== defaultAnonymizationFields.length
    ) {
      const existingAnonymizationFields = new Set(
        existingAnonymizationFieldsResponse.hits.hits.map((doc) => doc._source.field)
      );

      // Only create fields that are not present in the environment, we don't want to update any fields that the users might have already created with the same name.
      const documentsToCreate = defaultAnonymizationFields.filter(
        (field) => !existingAnonymizationFields.has(field.field)
      );

      const writer = await dataClient?.getWriter();

      const res = await writer?.bulk({
        documentsToCreate,
      });

      this.options.logger.info(`Created default anonymization fields: ${res?.docs_created.length}`);
    }
  }
}
