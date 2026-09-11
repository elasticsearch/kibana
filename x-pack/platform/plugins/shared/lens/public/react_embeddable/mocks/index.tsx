/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, NEVER, of, Subject } from 'rxjs';
import deepMerge from 'deepmerge';
import React from 'react';
import { faker } from '@faker-js/faker';
import type { Query, Filter, AggregateQuery, TimeRange } from '@kbn/es-query';
import type { PhaseEvent, ProjectRoutingOverrides, ViewMode } from '@kbn/presentation-publishing';
import { initializeTitleManager } from '@kbn/presentation-publishing';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { Adapters } from '@kbn/inspector-plugin/common';
import { coreMock } from '@kbn/core/public/mocks';
import { visualizationsPluginMock } from '@kbn/visualizations-plugin/public/mocks';
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import { embeddablePluginMock } from '@kbn/embeddable-plugin/public/mocks';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import type { ReactExpressionRendererProps } from '@kbn/expressions-plugin/public';
import { fieldsMetadataPluginPublicMock } from '@kbn/fields-metadata-plugin/public/mocks';
import type { ESQLControlVariable } from '@kbn/esql-types';
import {
  type Datasource,
  type DatasourceMap,
  type Visualization,
  type VisualizationMap,
  type ExpressionWrapperProps,
  type LensInternalApi,
  type LensRendererProps,
  type LensRuntimeState,
  type LensSerializedState,
  LENS_EMBEDDABLE_TYPE,
} from '@kbn/lens-common';
import type { LensApi } from '@kbn/lens-common-2';
import { createEmptyLensState } from '../helper';
import { createMockDatasource, createMockVisualization, makeDefaultServices } from '../../mocks';
import { initializeInternalApi } from '../initializers/initialize_internal_api';
import type { LensEmbeddableStartServices } from '../types';

function getDefaultLensApiMock() {
  const LensApiMock: LensApi = {
    // Static props
    type: LENS_EMBEDDABLE_TYPE,
    uuid: faker.string.uuid(),
    // Shared Embeddable Observables
    title$: new BehaviorSubject<string | undefined>(faker.lorem.words()),
    hideTitle$: new BehaviorSubject<boolean | undefined>(false),
    filters$: new BehaviorSubject<Filter[] | undefined>([]),
    query$: new BehaviorSubject<Query | AggregateQuery | undefined>({
      query: 'test',
      language: 'kuery',
    }),
    timeRange$: new BehaviorSubject<TimeRange | undefined>({ from: 'now-15m', to: 'now' }),
    dataLoading$: new BehaviorSubject<boolean | undefined>(false),
    // Methods
    getSavedVis: jest.fn(),
    getFullAttributes: jest.fn(),
    canViewUnderlyingData$: new BehaviorSubject<boolean>(false),
    loadViewUnderlyingData: jest.fn(),
    getViewUnderlyingDataArgs: jest.fn(() => ({
      dataViewSpec: { id: 'index-pattern-id' },
      timeRange: { from: 'now-7d', to: 'now' },
      filters: [],
      query: undefined,
      columns: [],
    })),
    isTextBasedLanguage: jest.fn(() => true),
    getTextBasedLanguage: jest.fn(),
    getInspectorAdapters: jest.fn(() => ({})),
    inspect: jest.fn(),
    closeInspector: jest.fn(async () => {}),
    supportedTriggers: jest.fn(() => []),
    canLinkToLibrary: jest.fn(async () => false),
    canUnlinkFromLibrary: jest.fn(async () => false),
    hasLibraryItemWithTitle: jest.fn().mockResolvedValue(false),
    /** New embeddable api inherited methods */
    anyStateChange$: of(),
    latestState$: of({}),
    serializeState: jest.fn(),
    getLegacySerializedState: jest.fn(),
    saveToLibrary: jest.fn(async () => 'saved-id'),
    onEdit: jest.fn(),
    getEditPanel: jest.fn(async () => <div data-test-subj="editLensFlyout" />),
    isEditingEnabled: jest.fn(() => true),
    getTypeDisplayName: jest.fn(() => 'Lens'),
    setTitle: jest.fn(),
    setHideTitle: jest.fn(),
    phase$: new BehaviorSubject<PhaseEvent | undefined>({
      id: faker.string.uuid(),
      status: 'rendered',
      timeToEvent: 1000,
    }),
    dataViews$: new BehaviorSubject<DataView[] | undefined>(undefined),
    savedObjectId$: new BehaviorSubject<string | undefined>(undefined),
    adapters$: new BehaviorSubject<Adapters>({}),
    updateAttributes: jest.fn(),
    updateRefId: jest.fn(),
    updateOverrides: jest.fn(),
    getSerializedStateByReference: jest.fn(),
    getSerializedStateByValue: jest.fn(),
    getTriggerCompatibleActions: jest.fn(),
    blockingError$: new BehaviorSubject<Error | undefined>(undefined),
    description$: new BehaviorSubject<string | undefined>(undefined),
    setDescription: jest.fn(),
    viewMode$: new BehaviorSubject<ViewMode>('view'),
    disabledActionIds$: new BehaviorSubject<string[] | undefined>(undefined),
    setDisabledActionIds: jest.fn(),
    rendered$: new BehaviorSubject<boolean>(false),
    searchSessionId$: new BehaviorSubject<string | undefined>(undefined),
    hasUnsavedChanges$: new BehaviorSubject<boolean>(false),
    applySerializedState: jest.fn(),
    projectRoutingOverrides$: new BehaviorSubject<ProjectRoutingOverrides | undefined>(undefined),
    esql$: new BehaviorSubject<AggregateQuery[]>([]),
    approximationApplied$: new BehaviorSubject<boolean | undefined>(false),
    supportsJsonExport: true,
    cancelRequests: jest.fn(),
  };
  return LensApiMock;
}

function getDefaultLensSerializedStateMock() {
  const LensSerializedStateMock: LensSerializedState = createEmptyLensState(
    'lnsXY',
    faker.lorem.words(),
    faker.lorem.text(),
    { query: 'test', language: 'kuery' }
  );
  return LensSerializedStateMock;
}

export function getLensAttributesMock(attributes?: Partial<LensRuntimeState['attributes']>) {
  return deepMerge(getDefaultLensSerializedStateMock().attributes!, attributes ?? {});
}

/**
 * Text-based (ES|QL) serialized state mock: the query lives on the
 * authoritative text-based layer, mirroring what the suggestion pipeline
 * produces for real documents.
 */
export function getTextBasedLensSerializedStateMock(
  esql: string = 'FROM index'
): LensSerializedState {
  const state = createEmptyLensState('lnsXY', faker.lorem.words(), faker.lorem.text());
  return {
    ...state,
    attributes: {
      ...state.attributes,
      state: {
        ...state.attributes.state,
        datasourceStates: {
          textBased: {
            layers: {
              layer1: { query: { esql }, columns: [], index: 'index' },
            },
          },
        },
      },
    },
  };
}

export function getLensApiMock(overrides: Partial<LensApi> = {}): LensApi {
  return {
    ...getDefaultLensApiMock(),
    ...overrides,
  };
}

export function getLensSerializedStateMock(overrides: Partial<LensSerializedState> = {}) {
  return {
    ref_id: faker.string.uuid(),
    ...getDefaultLensSerializedStateMock(),
    ...overrides,
  };
}

export function getLensRuntimeStateMock(
  overrides: Partial<LensRuntimeState> = {}
): LensRuntimeState {
  return {
    ...(getDefaultLensSerializedStateMock() as LensRuntimeState),
    ...overrides,
  };
}

export function getLensComponentProps(overrides: Partial<LensRendererProps> = {}) {
  return {
    ...getDefaultLensSerializedStateMock(),
    ...getDefaultLensApiMock(),
    ...overrides,
  };
}

export function makeEmbeddableServices(
  sessionIdSubject = new Subject<string>(),
  sessionId: string | undefined = undefined,
  {
    visOverrides,
    dataOverrides,
  }: {
    visOverrides?: { id: string } & Partial<Visualization>;
    dataOverrides?: { id: string } & Partial<Datasource>;
  } = {}
): jest.Mocked<LensEmbeddableStartServices> {
  const services = makeDefaultServices(sessionIdSubject, sessionId);
  return {
    ...services,
    expressions: expressionsPluginMock.createStartContract(),
    visualizations: visualizationsPluginMock.createStartContract(),
    embeddable: embeddablePluginMock.createStartContract(),
    eventAnnotation: {} as LensEmbeddableStartServices['eventAnnotation'],
    eventAnnotationService: {
      annotationGroupUpdated$: NEVER,
    } as unknown as LensEmbeddableStartServices['eventAnnotationService'],
    timefilter: services.data.query.timefilter.timefilter,
    coreHttp: services.http,
    coreStart: coreMock.createStart(),
    capabilities: services.application.capabilities,
    expressionRenderer: jest.fn().mockReturnValue(null),
    documentToExpression: jest.fn(),
    injectFilterReferences: services.data.query.filterManager.inject as jest.Mock,
    visualizationMap: mockVisualizationMap(visOverrides?.id, visOverrides),
    datasourceMap: mockDatasourceMap(dataOverrides?.id, dataOverrides),
    charts: chartPluginMock.createStartContract(),
    inspector: {
      ...services.inspector,
      isAvailable: jest.fn().mockReturnValue(true),
      open: jest.fn(),
    },
    uiActions: {
      ...services.uiActions,
      getTrigger: jest.fn().mockImplementation(() => ({ exec: jest.fn() })),
    },
    fieldsMetadata: fieldsMetadataPluginPublicMock.createStartContract(),
  };
}

export const mockVisualizationMap = (
  type: string | undefined = undefined,
  overrides: Partial<Visualization> = {}
): VisualizationMap => {
  if (type == null) {
    return {};
  }
  return {
    [type]: { ...createMockVisualization(type), ...overrides },
  };
};

export const mockDatasourceMap = (
  type: string | undefined = undefined,
  overrides: Partial<Datasource> = {}
): DatasourceMap => {
  const baseMap = {
    // define the existing ones
    formBased: createMockDatasource('formBased'),
    textBased: createMockDatasource('textBased'),
  };
  if (type == null) {
    return baseMap;
  }
  return {
    // define the existing ones
    ...baseMap,
    // override at will
    [type]: {
      ...createMockDatasource(type),
      ...overrides,
    },
  };
};

export function createExpressionRendererMock(): jest.Mock<
  React.ReactElement,
  [ReactExpressionRendererProps]
> {
  return jest.fn(({ expression }) => (
    <span data-test-subj="lnsExpressionRenderer">
      {(expression as string) || 'Expression renderer mock'}
    </span>
  ));
}

export function getValidExpressionParams(
  overrides: Partial<ExpressionWrapperProps> = {}
): ExpressionWrapperProps {
  return {
    ExpressionRenderer: createExpressionRendererMock(),
    expression: 'test',
    searchContext: {},
    handleEvent: jest.fn(),
    onData$: jest.fn(),
    onRender$: jest.fn(),
    addUserMessages: jest.fn(),
    onRuntimeError: jest.fn(),
    lensInspector: {
      getInspectorAdapters: jest.fn(),
      inspect: jest.fn(),
      closeInspector: jest.fn(),
    },
    ...overrides,
  };
}

function getInternalApiWithFunctionWrappers() {
  const mockRuntimeState = getLensRuntimeStateMock();
  const newApi = initializeInternalApi(
    mockRuntimeState,
    {},
    initializeTitleManager(mockRuntimeState),
    makeEmbeddableServices()
  );
  const fns: Array<keyof LensInternalApi> = (
    Object.keys(newApi) as Array<keyof LensInternalApi>
  ).filter((key) => typeof newApi[key] === 'function');
  for (const fn of fns) {
    const originalFn = newApi[fn];
    // @ts-expect-error
    newApi[fn] = jest.fn(originalFn);
  }
  return newApi;
}

export function getLensInternalApiMock(overrides: Partial<LensInternalApi> = {}): LensInternalApi {
  return {
    ...getInternalApiWithFunctionWrappers(),
    ...overrides,
  };
}

export function createUnifiedSearchApi(
  query: Query | AggregateQuery = {
    query: '',
    language: 'kuery',
  },
  filters: Filter[] = [],
  timeRange: TimeRange = { from: 'now-7d', to: 'now' },
  projectRouting?: string
) {
  return {
    filters$: new BehaviorSubject<Filter[] | undefined>(filters),
    query$: new BehaviorSubject<Query | AggregateQuery | undefined>(query),
    timeRange$: new BehaviorSubject<TimeRange | undefined>(timeRange),
    projectRouting$: new BehaviorSubject<string | undefined>(projectRouting),
  };
}

export function createParentApiMock(overrides: object = {}) {
  return {
    esqlVariables$: new BehaviorSubject<ESQLControlVariable[]>([]),
    ...overrides,
  };
}
