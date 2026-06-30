/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SearchHit,
  UpdateResponse,
  WriteResponseBase,
} from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { DataStreamSpacesAdapter } from '@kbn/data-stream-adapter';
import type {
  DefendInsightsGetRequestQuery,
  DefendInsightsPostRequestBody,
} from '@kbn/elastic-assistant-common';
import { CallbackIds } from '@kbn/elastic-assistant-plugin/server/types';
import { combineLatest, firstValueFrom, ReplaySubject } from 'rxjs';
import { cloneDeep } from 'lodash';
import type {
  DefendInsight,
  WorkflowInsightType,
  SearchParams,
  SecurityWorkflowInsight,
} from '../../../../common/endpoint/types/workflow_insights';
import { WorkflowInsightActionType } from '../../../../common/endpoint/types/workflow_insights';

import { ENDPOINT_WORKFLOW_INSIGHTS_CREATED_EVENT } from '../../../lib/telemetry/event_based/events';
import type { EndpointAppContextService } from '../../endpoint_app_context_services';
import { SecurityWorkflowInsightsFailedInitialized } from './errors';
import {
  buildEsQueryParams,
  checkIfRemediationExists,
  createDatastream,
  createPipeline,
  generateInsightId,
  getUniqueInsights,
} from './helpers';
import { DATA_STREAM_NAME } from './constants';
import { buildWorkflowInsights } from './builders';
import { hasConnectedRemoteClusters } from '../../utils/ccs_utils';

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_SUPPRESS_SIZE = 1000;

interface SetupInterface {
  kibanaVersion: string;
  logger: Logger;
  endpointContext: EndpointAppContextService;
}

interface StartInterface {
  esClient: ElasticsearchClient;
  registerDefendInsightsCallback: (callbackId: CallbackIds, callback: Function) => void;
}

class SecurityWorkflowInsightsService {
  private setup$ = new ReplaySubject<void>(1);
  private start$ = new ReplaySubject<void>(1);
  private stop$ = new ReplaySubject<void>(1);
  private ds: DataStreamSpacesAdapter | undefined;
  private _esClient: ElasticsearchClient | undefined;
  private _endpointContext: EndpointAppContextService | undefined;
  private _logger: Logger | undefined;
  private _isInitialized: Promise<[void, void]> = firstValueFrom(
    combineLatest<[void, void]>([this.setup$, this.start$])
  );

  /**
   * Lifecycle
   */

  public get isInitialized() {
    return this._isInitialized;
  }

  public setup({ kibanaVersion, logger, endpointContext }: SetupInterface) {
    this._logger = logger;
    this._endpointContext = endpointContext;

    try {
      this.ds = createDatastream(kibanaVersion);
    } catch (err) {
      this.logger.warn(new SecurityWorkflowInsightsFailedInitialized(err.message).message);
      return;
    }

    this.setup$.next();
  }

  public async start({ esClient, registerDefendInsightsCallback }: StartInterface) {
    this._esClient = esClient;
    await firstValueFrom(this.setup$);

    try {
      this.registerDefendInsightsCallbacks(registerDefendInsightsCallback);
      await createPipeline(esClient);
      await this.ds?.install({
        logger: this.logger,
        esClient,
        pluginStop$: this.stop$,
      });

      try {
        await esClient.indices.createDataStream({ name: DATA_STREAM_NAME });
      } catch (err) {
        if (err?.body?.error?.type === 'resource_already_exists_exception') {
          this.logger.debug(`Datastream ${DATA_STREAM_NAME} already exists`);
        } else {
          throw new SecurityWorkflowInsightsFailedInitialized(err.message);
        }
      }
    } catch (err) {
      this.logger.warn(err.message);
      return;
    }

    this.start$.next();
  }

  public stop() {
    this.setup$.next();
    this.setup$.complete();
    this.start$.next();
    this.start$.complete();
    this.stop$.next();
    this.stop$.complete();
  }

  /**
   * Basic CRUD operations
   */

  public async create(
    insight: SecurityWorkflowInsight,
    spaceId: string
  ): Promise<WriteResponseBase | void> {
    await this.isInitialized;

    const insightToCreate = cloneDeep(insight);

    const ccsEnabled = await hasConnectedRemoteClusters(
      this.esClient,
      this.endpointContext.experimentalFeatures.defendRemoteOutputCcs
    );

    const remediationExists = await checkIfRemediationExists({
      insight: insightToCreate,
      exceptionListsClient: this.endpointContext.getExceptionListsClient(),
      endpointMetadataClient: this.endpointContext.getEndpointMetadataService(spaceId),
      ccsEnabled,
    });

    if (remediationExists) {
      insightToCreate.action.type = WorkflowInsightActionType.enum.remediated;
    }

    const id = generateInsightId(insightToCreate);

    // if insight already exists, update instead
    const existingInsights = await this.fetch({ ids: [id] });
    if (existingInsights.length) {
      return this.update(id, insightToCreate, existingInsights[0]._index);
    }

    return this.esClient.index<SecurityWorkflowInsight>({
      index: DATA_STREAM_NAME,
      id,
      document: insightToCreate,
      refresh: 'wait_for',
      op_type: 'create',
    });
  }

  public async update(
    id: string,
    insight: Partial<SecurityWorkflowInsight>,
    backingIndex: string
  ): Promise<UpdateResponse> {
    await this.isInitialized;

    return this.esClient.update<SecurityWorkflowInsight>({
      index: backingIndex,
      id,
      doc: insight,
      refresh: 'wait_for',
    });
  }

  public async fetch(params?: SearchParams): Promise<Array<SearchHit<SecurityWorkflowInsight>>> {
    await this.isInitialized;

    const size = params?.size ?? DEFAULT_PAGE_SIZE;
    const from = params?.from ?? 0;

    const termFilters = params ? buildEsQueryParams(params) : [];
    const response = await this.esClient.search<SecurityWorkflowInsight>({
      index: DATA_STREAM_NAME,
      query: {
        bool: {
          must: termFilters,
        },
      },
      size,
      from,
    });

    return response?.hits?.hits ?? [];
  }

  /**
   * Helper functions
   */

  private get esClient(): ElasticsearchClient {
    if (!this._esClient) {
      throw new SecurityWorkflowInsightsFailedInitialized('no elasticsearch client found');
    }

    return this._esClient;
  }

  private get logger(): Logger {
    if (!this._logger) {
      throw new SecurityWorkflowInsightsFailedInitialized('no logger found');
    }

    return this._logger;
  }

  private get endpointContext(): EndpointAppContextService {
    if (!this._endpointContext) {
      throw new SecurityWorkflowInsightsFailedInitialized('no endpoint context found');
    }

    return this._endpointContext;
  }

  /**
   * Plugin callbacks called from elastic_assistant plugin
   */

  private registerDefendInsightsCallbacks(
    registerCallback: (callbackId: CallbackIds, callback: Function) => void
  ): void {
    registerCallback(
      CallbackIds.DefendInsightsPostCreate,
      (
        defendInsights: DefendInsight[],
        request: KibanaRequest<unknown, unknown, DefendInsightsPostRequestBody>
      ) =>
        this.createFromDefendInsights(
          defendInsights,
          request.body.endpointIds,
          request.body.insightType,
          request.body.apiConfig.connectorId,
          request.body.apiConfig.model,
          this.endpointContext.getActiveSpaceId(request)
        )
    );
    registerCallback(CallbackIds.DefendInsightsPreCreate, this.onBeforeCreate.bind(this));
    registerCallback(CallbackIds.DefendInsightsPostFetch, this.onAfterFetch.bind(this));
  }

  private async suppressExistingInsights(endpointIds: string[], types: WorkflowInsightType[]) {
    const existingInsights = await this.fetch({
      size: DEFAULT_SUPPRESS_SIZE,
      targetIds: endpointIds,
      types,
      actionTypes: [WorkflowInsightActionType.enum.refreshed],
    });

    return Promise.all(
      existingInsights.map((existingInsight) => {
        if (!existingInsight) {
          return Promise.resolve();
        }

        const source = existingInsight._source as SecurityWorkflowInsight;
        return this.update(
          existingInsight._id as string,
          { action: { ...source.action, type: WorkflowInsightActionType.enum.suppressed } },
          existingInsight._index
        );
      })
    );
  }

  public async onAfterFetch(
    request: KibanaRequest<unknown, unknown, DefendInsightsGetRequestQuery>,
    agentIds: string[]
  ): Promise<void> {
    await this.ensureAgentIdsInCurrentSpace(request, agentIds);
  }

  public async onBeforeCreate(
    request: KibanaRequest<unknown, unknown, DefendInsightsPostRequestBody>
  ): Promise<void> {
    const agentIds = request.body?.endpointIds ?? [];
    await this.ensureAgentIdsInCurrentSpace(request, agentIds);
  }

  public async createFromDefendInsights(
    defendInsights: DefendInsight[],
    endpointIds: string[],
    insightType: WorkflowInsightType,
    connectorId: string,
    model: string = '',
    spaceId: string
  ) {
    await this.isInitialized;

    // suppress existing insights since they might be stale, any current ones will be refreshed
    await this.suppressExistingInsights(endpointIds, [insightType]);

    // comes after suppression since we should always suppress stale insights
    if (!defendInsights || !defendInsights.length) {
      return [];
    }

    const ccsEnabled = await hasConnectedRemoteClusters(
      this.esClient,
      this.endpointContext.experimentalFeatures.defendRemoteOutputCcs
    );

    const workflowInsights = await buildWorkflowInsights({
      defendInsights,
      endpointMetadataService: this.endpointContext.getEndpointMetadataService(spaceId),
      esClient: this.esClient,
      ccsEnabled,
      options: {
        insightType,
        endpointIds,
        connectorId,
        model,
      },
    });

    const uniqueInsights = getUniqueInsights(workflowInsights);

    const results = await Promise.all(
      uniqueInsights.map((insight) => this.create(insight, spaceId))
    );

    try {
      const telemetry = this.endpointContext.getTelemetryService();
      telemetry.reportEvent(ENDPOINT_WORKFLOW_INSIGHTS_CREATED_EVENT.eventType, {
        insightType,
        count: uniqueInsights.length,
      });
    } catch (e) {
      this.logger.debug(`Failed to report insight creation telemetry: ${e.message}`);
    }

    return results;
  }

  public async ensureAgentIdsInCurrentSpace(
    request: KibanaRequest,
    agentIds: string[] = []
  ): Promise<void> {
    const { id: spaceId } = await this.endpointContext.getActiveSpace(request);
    const fleetServices = this.endpointContext.getInternalFleetServices(spaceId);
    await fleetServices.ensureInCurrentSpace({ agentIds });
  }
}

export const securityWorkflowInsightsService = new SecurityWorkflowInsightsService();
