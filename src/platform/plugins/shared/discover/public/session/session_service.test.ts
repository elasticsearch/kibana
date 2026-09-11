/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  VIEW_MODE,
  type DiscoverSession,
  type DiscoverSessionTab,
} from '@kbn/saved-search-plugin/common';
import type { SaveDiscoverSessionParams } from '@kbn/saved-search-plugin/public';
import { savedSearchPluginMock } from '@kbn/saved-search-plugin/public/mocks';
import { ESQL_CONTROL } from '@kbn/controls-constants';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import { DiscoverTabType, UnifiedHistogramSuggestionType } from '@kbn/discover-utils';
import { FilterStateStore } from '@kbn/es-query';
import { cloneDeep } from 'lodash';
import type {
  DiscoverSessionApiData,
  DiscoverSessionApiResponse,
  DiscoverSessionApiTab,
} from '../../server';
import type { DiscoverSessionClient, DiscoverSessionGetResult } from './api_client';
import { createSessionService } from './session_service';

const runtimeTab: DiscoverSessionTab = {
  id: 'logs-tab',
  label: 'Logs',
  sort: [],
  columns: [],
  grid: {},
  hideChart: false,
  hideTable: false,
  isTextBasedQuery: false,
  usesAdHocDataView: false,
  serializedSearchSource: { index: 'logs-data-view' },
};

const apiData: DiscoverSessionApiData = {
  title: 'Session',
  description: '',
  tabs: [
    {
      id: 'logs-tab',
      label: 'Logs',
      type: DiscoverTabType.Default,
      sort: [],
      column_order: [],
      filters: [],
      data_source: { type: 'data_view_reference', ref_id: 'logs-data-view' },
      view_mode: VIEW_MODE.DOCUMENT_LEVEL,
      hide_chart: false,
      hide_table: false,
    },
  ],
};

const apiResponse: DiscoverSessionApiResponse = {
  id: 'session-id',
  data: apiData,
  meta: { managed: false },
};

const apiGetResponse: DiscoverSessionGetResult = {
  ...apiResponse,
  resolve: {
    outcome: 'conflict',
    aliasTargetId: 'other-session',
    aliasPurpose: 'savedObjectConversion',
  },
  warnings: [
    {
      type: 'dropped_property',
      tab_id: 'logs-tab',
      key: 'control_panels',
      message: 'Unable to transform control panels.',
    },
  ],
};

const session: SaveDiscoverSessionParams = {
  id: 'session-id',
  title: 'Session',
  description: '',
  tabs: [runtimeTab],
};
const persistedSession: DiscoverSession = {
  ...session,
  id: 'session-id',
  managed: false,
};

describe('Discover session service', () => {
  it('loads through REST with resolution metadata and warnings when the switch is enabled', async () => {
    const apiClient = createApiClient();
    const legacyClient = savedSearchPluginMock.createStartContract();
    const sessionService = createSessionService({
      apiClient,
      legacyClient,
      useHttpApi: true,
    });

    const loaded = await sessionService.get('session-id');

    expect(apiClient.get).toHaveBeenCalledWith('session-id');
    expect(apiClient.upsert).not.toHaveBeenCalled();
    expect(apiClient.create).not.toHaveBeenCalled();
    expect(legacyClient.getDiscoverSession).not.toHaveBeenCalled();
    expect(legacyClient.saveDiscoverSession).not.toHaveBeenCalled();
    expect(loaded.session.sharingSavedObjectProps).toEqual(apiGetResponse.resolve);
    expect(loaded.warnings).toEqual(apiGetResponse.warnings);
    expect(loaded.session).toEqual(
      expect.objectContaining({
        id: 'session-id',
        title: 'Session',
        tabs: [expect.objectContaining({ id: 'logs-tab', label: 'Logs' })],
      })
    );
  });

  it.each([
    {
      action: 'Save',
      copyOnSave: false,
      savedId: 'resolved-session-id',
      method: 'upsert' as const,
      unusedMethod: 'create' as const,
      idArgs: ['session-id'],
    },
    {
      action: 'Save As',
      copyOnSave: true,
      savedId: 'copied-session-id',
      method: 'create' as const,
      unusedMethod: 'upsert' as const,
      idArgs: [],
    },
  ])(
    'keeps the submitted tabs after $action and uses the returned identity and metadata',
    async ({ copyOnSave, savedId, method, unusedMethod, idArgs }) => {
      const { submittedSession, data } = createSaveFixture();
      const beforeSave = cloneDeep(submittedSession);
      const apiClient = createApiClient();
      const legacyClient = savedSearchPluginMock.createStartContract();
      // The API omits pin markers, inline IDs, the live fingerprint, and control order numbers.
      // Saving must keep those local values without rebuilding the tabs from this response.
      const saveResponse: DiscoverSessionApiResponse = {
        id: savedId,
        data,
        meta: { managed: true },
      };
      apiClient.create.mockResolvedValue(saveResponse);
      apiClient.upsert.mockResolvedValue(saveResponse);
      const sessionService = createSessionService({
        apiClient,
        legacyClient,
        useHttpApi: true,
      });

      const savedSession = await sessionService.save(submittedSession, { copyOnSave });

      expect(apiClient[method]).toHaveBeenCalledTimes(1);
      expect(apiClient[method]).toHaveBeenCalledWith(...idArgs, data);
      expect(apiClient[unusedMethod]).not.toHaveBeenCalled();
      expect(legacyClient.saveDiscoverSession).not.toHaveBeenCalled();
      expect(savedSession).toStrictEqual({
        ...beforeSave,
        id: savedId,
        managed: true,
        references: [{ id: 'tag-1', type: 'tag', name: 'tag-ref-tag-1' }],
      });
      expect(submittedSession).toStrictEqual(beforeSave);
      expect(apiClient.get).not.toHaveBeenCalled();
    }
  );

  it('creates a new session without an ID and keeps the submitted tabs', async () => {
    const { id: _id, ...newSession } = session;
    const apiClient = createApiClient();
    const sessionService = createSessionService({
      apiClient,
      legacyClient: savedSearchPluginMock.createStartContract(),
      useHttpApi: true,
    });

    const savedSession = await sessionService.save(newSession, {});

    expect(apiClient.create).toHaveBeenCalledWith(apiData);
    expect(apiClient.upsert).not.toHaveBeenCalled();
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(savedSession?.id).toBe(apiResponse.id);
    expect(savedSession?.tabs).toStrictEqual(newSession.tabs);
    expect(newSession).not.toHaveProperty('id');
  });

  it('uses the legacy client when the local switch is disabled', async () => {
    const apiClient = createApiClient();
    const legacyClient = savedSearchPluginMock.createStartContract();
    jest.mocked(legacyClient.getDiscoverSession).mockResolvedValue(persistedSession);
    jest.mocked(legacyClient.saveDiscoverSession).mockResolvedValue(persistedSession);
    const sessionService = createSessionService({
      apiClient,
      legacyClient,
      useHttpApi: false,
    });

    const loaded = await sessionService.get('session-id');
    const savedSession = await sessionService.save(session, { copyOnSave: false });

    expect(legacyClient.getDiscoverSession).toHaveBeenCalledWith('session-id');
    expect(legacyClient.saveDiscoverSession).toHaveBeenCalledWith(session, {
      copyOnSave: false,
    });
    expect(apiClient.get).not.toHaveBeenCalled();
    expect(apiClient.upsert).not.toHaveBeenCalled();
    expect(apiClient.create).not.toHaveBeenCalled();
    expect(loaded).toEqual({ session: persistedSession, warnings: [] });
    expect(savedSession).toBe(persistedSession);
  });
});

const createApiClient = (): jest.Mocked<DiscoverSessionClient> => ({
  create: jest.fn().mockResolvedValue(apiResponse),
  get: jest.fn().mockResolvedValue(apiGetResponse),
  upsert: jest.fn().mockResolvedValue(apiResponse),
});

const createSaveFixture = () => {
  const controlConfig = {
    variable_name: 'environment',
    variable_type: 'values',
    control_type: 'STATIC_VALUES',
    available_options: ['production', 'staging'],
    selected_options: ['production'],
    single_select: true,
  } satisfies OptionsListESQLControlState;
  const chartAttributes = {
    visualizationType: 'lnsXY',
    state: {
      datasourceStates: { textBased: { layers: { 'layer-1': { index: 'stored-esql-id' } } } },
      adHocDataViews: { 'stored-esql-id': { type: 'esql', timeFieldName: '@timestamp' } },
    },
  };

  const submittedSession: SaveDiscoverSessionParams = {
    ...session,
    tags: ['tag-1'],
    tabs: [
      // Identical specs may have different IDs after editing. Saving must keep both IDs.
      ...['inline-a', 'inline-b'].map(
        (id): DiscoverSessionTab => ({
          ...runtimeTab,
          id,
          label: id,
          usesAdHocDataView: true,
          serializedSearchSource: {
            index: {
              id: `runtime-${id}`,
              title: 'logs-*',
              timeFieldName: '@timestamp',
              sourceFilters: [{ value: 'secret.*' }],
              fieldFormats: {},
              runtimeFieldMap: {},
              fieldAttrs: {},
              allowNoIndex: false,
              allowHidden: false,
              managed: false,
            },
            filter: [
              {
                meta: { index: `runtime-${id}` },
                query: { match_all: {} },
                $state: { store: FilterStateStore.GLOBAL_STATE },
              },
            ],
          },
        })
      ),
      {
        ...runtimeTab,
        id: 'esql',
        label: 'ES|QL',
        isTextBasedQuery: true,
        serializedSearchSource: { query: { esql: 'FROM logs-*' } },
        breakdownField: 'host.name',
        visContext: {
          suggestionType: UnifiedHistogramSuggestionType.histogramForESQL,
          attributes: chartAttributes,
          requestData: {
            dataViewId: 'live-esql-id',
            timeField: '@timestamp',
            breakdownField: 'host.name',
          },
        },
        controlGroupJson: JSON.stringify({
          last: {
            ...controlConfig,
            variable_name: 'last',
            type: ESQL_CONTROL,
            width: 'medium',
            grow: true,
            order: 2,
          },
          first: {
            ...controlConfig,
            variable_name: 'first',
            type: ESQL_CONTROL,
            width: 'medium',
            grow: true,
            order: 0,
          },
        }),
      },
    ],
  };

  const data: DiscoverSessionApiData = {
    ...apiData,
    tags: ['tag-1'],
    tabs: [
      ...['inline-a', 'inline-b'].map(
        (id): DiscoverSessionApiTab => ({
          id,
          label: id,
          type: DiscoverTabType.Default,
          sort: [],
          column_order: [],
          filters: [{ type: 'dsl', dsl: { query: { match_all: {} } } }],
          data_source: {
            type: 'data_view_spec',
            index_pattern: 'logs-*',
            time_field: '@timestamp',
            allow_hidden_indices: false,
            field_filters: ['secret.*'],
          },
          view_mode: VIEW_MODE.DOCUMENT_LEVEL,
          hide_chart: false,
          hide_table: false,
        })
      ),
      {
        id: 'esql',
        label: 'ES|QL',
        sort: [],
        column_order: [],
        type: DiscoverTabType.Default,
        data_source: { type: 'esql', query: 'FROM logs-*' },
        hide_chart: false,
        hide_table: false,
        breakdown_field: 'host.name',
        vis_context: {
          suggestion_type: UnifiedHistogramSuggestionType.histogramForESQL,
          attributes: chartAttributes,
        },
        control_panels: ['first', 'last'].map((id) => ({
          id,
          type: ESQL_CONTROL,
          width: 'medium',
          grow: true,
          config: { ...controlConfig, variable_name: id },
        })),
      },
    ],
  };

  return { submittedSession, data };
};
