/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Observable } from 'rxjs';
import { BehaviorSubject, of } from 'rxjs';
import type { DiscoverServices, HistoryLocationState } from '../build_services';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { uiActionsPluginMock } from '@kbn/ui-actions-plugin/public/mocks';
import { expressionsPluginMock } from '@kbn/expressions-plugin/public/mocks';
import { savedSearchPluginMock } from '@kbn/saved-search-plugin/public/mocks';
import {
  analyticsServiceMock,
  coreMock,
  docLinksServiceMock,
  notificationServiceMock,
  scopedHistoryMock,
  themeServiceMock,
} from '@kbn/core/public/mocks';
import { loggerMock } from '@kbn/logging-mocks';
import {
  CONTEXT_STEP_SETTING,
  DEFAULT_COLUMNS_SETTING,
  DOC_HIDE_TIME_COLUMN_SETTING,
  MAX_DOC_FIELDS_DISPLAYED,
  SAMPLE_SIZE_SETTING,
  SAMPLE_ROWS_PER_PAGE_SETTING,
  SORT_DEFAULT_ORDER_SETTING,
  HIDE_ANNOUNCEMENTS,
  SEARCH_ON_PAGE_LOAD_SETTING,
} from '@kbn/discover-utils';
import type { IKibanaSearchResponse } from '@kbn/search-types';
import { UI_SETTINGS, calculateBounds, SearchSource } from '@kbn/data-plugin/public';
import { TopNavMenu } from '@kbn/navigation-plugin/public';
import { FORMATS_UI_SETTINGS } from '@kbn/field-formats-plugin/common';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { embeddablePluginMock } from '@kbn/embeddable-plugin/public/mocks';
import { LocalStorageMock } from './local_storage_mock';
import { createDiscoverDataViewsMock } from './data_views';
import type { SearchSourceDependencies } from '@kbn/data-plugin/common';
import type { SearchResponse } from '@elastic/elasticsearch/lib/api/types';
import { createElement } from 'react';
import { createContextAwarenessMocks } from '../context_awareness/__mocks__';
import { ProfileStateRegistry } from '../context_awareness';
import { DiscoverEBTManager } from '../ebt_manager';
import { discoverSharedPluginMock } from '@kbn/discover-shared-plugin/public/mocks';
import { createUrlTrackerMock } from './url_tracker.mock';
import { createBrowserHistory } from 'history';
import { cpsPluginMock } from '@kbn/cps/public/mocks';

export function createDiscoverServicesMock(): DiscoverServices {
  const dataPlugin = dataPluginMock.createStartContract();

  dataPlugin.query.queryString.getDefaultQuery = jest.fn(() => ({ query: '', language: 'kuery' }));

  dataPlugin.query.filterManager.getFilters = jest.fn(() => []);
  dataPlugin.query.filterManager.getUpdates$ = jest.fn(() => of({}) as unknown as Observable<void>);

  dataPlugin.query.timefilter.timefilter.createFilter = jest.fn();
  dataPlugin.query.timefilter.timefilter.getAbsoluteTime = jest.fn(() => ({
    from: '2021-08-31T22:00:00.000Z',
    to: '2022-09-01T09:16:29.553Z',
  }));
  dataPlugin.query.timefilter.timefilter.getTime = jest.fn(() => {
    return { from: 'now-15m', to: 'now' };
  });
  dataPlugin.query.timefilter.timefilter.getTimeDefaults = jest.fn(() => {
    return { from: 'now-15m', to: 'now' };
  });
  dataPlugin.query.timefilter.timefilter.getRefreshInterval = jest.fn(() => {
    return { pause: true, value: 1000 };
  });
  dataPlugin.query.timefilter.timefilter.calculateBounds = jest.fn(calculateBounds);

  dataPlugin.query.getState = jest.fn(() => ({
    query: { query: '', language: 'lucene' },
    filters: [],
    time: {
      from: 'now-15m',
      to: 'now',
    },
  }));

  dataPlugin.dataViews = createDiscoverDataViewsMock();

  const createSearchSourceWithDeps = (fields?: Record<string, unknown>) => {
    const deps = {
      getConfig: jest.fn(),
    } as unknown as SearchSourceDependencies;
    const searchSource = new SearchSource(fields ?? {}, deps);
    searchSource.fetch$ = jest
      .fn()
      .mockReturnValue(of({ rawResponse: { hits: { total: 2, hits: [] } } }));
    searchSource.createChild = jest.fn((options = {}) => {
      const childSearchSource = new SearchSource({}, deps);
      childSearchSource.setParent(searchSource, options);
      childSearchSource.fetch$ = <T>() =>
        of({ rawResponse: { hits: { hits: [] } } } as unknown as IKibanaSearchResponse<
          SearchResponse<T>
        >);
      return childSearchSource;
    });
    return searchSource;
  };

  dataPlugin.search.searchSource.createEmpty = jest.fn(() => createSearchSourceWithDeps());

  dataPlugin.search.searchSource.create = jest.fn(async (fields?: Record<string, unknown>) => {
    if (typeof fields?.index === 'string') {
      try {
        const dataView = await dataPlugin.dataViews.get(fields.index);
        return createSearchSourceWithDeps({ ...fields, index: dataView });
      } catch {
        // Data view not found in mock, create with raw fields
      }
    }
    return createSearchSourceWithDeps(fields);
  });

  const expressionsPlugin = expressionsPluginMock.createStartContract();

  expressionsPlugin.run = jest.fn(() =>
    of({
      partial: false,
      result: {
        rows: [],
      },
    })
  ) as unknown as typeof expressionsPlugin.run;

  expressionsPlugin.execute = jest.fn(() => ({
    getData: jest.fn(() =>
      of({
        result: { type: 'datatable', rows: [], columns: [] },
      })
    ),
  })) as unknown as typeof expressionsPlugin.execute;

  const corePluginMock = coreMock.createStart();

  const uiSettingsMock: Partial<typeof corePluginMock.uiSettings> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: jest.fn((key: string): any => {
      if (key === 'fields:popularLimit') {
        return 5;
      } else if (key === DEFAULT_COLUMNS_SETTING) {
        return ['default_column'];
      } else if (key === UI_SETTINGS.META_FIELDS) {
        return [];
      } else if (key === DOC_HIDE_TIME_COLUMN_SETTING) {
        return false;
      } else if (key === CONTEXT_STEP_SETTING) {
        return 5;
      } else if (key === SORT_DEFAULT_ORDER_SETTING) {
        return 'desc';
      } else if (key === FORMATS_UI_SETTINGS.SHORT_DOTS_ENABLE) {
        return false;
      } else if (key === SAMPLE_SIZE_SETTING) {
        return 250;
      } else if (key === SAMPLE_ROWS_PER_PAGE_SETTING) {
        return 150;
      } else if (key === MAX_DOC_FIELDS_DISPLAYED) {
        return 50;
      } else if (key === HIDE_ANNOUNCEMENTS) {
        return false;
      } else if (key === SEARCH_ON_PAGE_LOAD_SETTING) {
        return true;
      }
    }),
    isDefault: jest.fn((key: string) => {
      return true;
    }),
  };

  corePluginMock.uiSettings = {
    ...corePluginMock.uiSettings,
    ...uiSettingsMock,
  };

  const theme = themeServiceMock.createSetupContract({ darkMode: false, name: 'borealis' });

  corePluginMock.theme = theme;
  corePluginMock.chrome.getActiveSolutionNavId$.mockReturnValue(new BehaviorSubject(null));
  corePluginMock.chrome.getChromeStyle$.mockReturnValue(new BehaviorSubject('classic'));

  const history = createBrowserHistory<HistoryLocationState>();
  history.push('/');

  const { profilesManagerMock } = createContextAwarenessMocks();

  return {
    analytics: analyticsServiceMock.createAnalyticsServiceStart(),
    application: corePluginMock.application,
    core: corePluginMock,
    charts: chartPluginMock.createSetupContract(),
    chrome: corePluginMock.chrome,
    history,
    getScopedHistory: () => scopedHistoryMock.create(),
    data: dataPlugin,
    dataVisualizer: {
      FieldStatisticsTable: jest.fn(() => createElement('div')),
    },
    aiops: {
      getPatternAnalysisAvailable: jest.fn().mockResolvedValue(jest.fn(() => true)),
      PatternAnalysisComponent: jest.fn(() => createElement('div')),
    },
    docLinks: docLinksServiceMock.createStartContract(),
    embeddable: embeddablePluginMock.createStartContract(),
    capabilities: {
      visualize_v2: {
        show: true,
      },
      discover_v2: {
        save: false,
      },
      advancedSettings: {
        save: true,
      },
      management: {
        insightsAndAlerting: {
          triggersActions: true,
        },
      },
      indexPatterns: {
        save: true,
      },
    },
    fieldFormats: fieldFormatsMock,
    filterManager: dataPlugin.query.filterManager,
    inspector: {
      open: jest.fn(),
    },
    uiActions: uiActionsPluginMock.createStartContract(),
    uiSettings: uiSettingsMock,
    settings: corePluginMock.settings,
    http: {
      basePath: '/',
      post: jest.fn((path: string) => {
        // Mock ES|QL timefield endpoint so an ES|QL data view can be created
        if (path.startsWith('/internal/esql/get_timefield')) {
          return Promise.resolve({ timeField: '@timestamp' });
        }
        return Promise.resolve('');
      }),
    },
    dataViewEditor: {
      openEditor: jest.fn(),
      userPermissions: {
        editDataView: jest.fn(() => true),
      },
    },
    dataViewFieldEditor: {
      openEditor: jest.fn(),
      userPermissions: {
        editIndexPattern: jest.fn(() => true),
      },
    },
    navigation: {
      ui: { TopNavMenu, AggregateQueryTopNavMenu: TopNavMenu },
    },
    metadata: {
      branch: 'test',
      version: 'major.minor.patch',
    },
    theme,
    storage: new LocalStorageMock({}) as unknown as Storage,
    addBasePath: jest.fn(),
    toastNotifications: {
      addInfo: jest.fn(),
      addWarning: jest.fn(),
      addDanger: jest.fn(),
      addSuccess: jest.fn(),
    },
    notifications: {
      toasts: notificationServiceMock.createStartContract().toasts,
    },
    expressions: expressionsPlugin,
    savedObjectsTagging: {
      ui: {
        getTagIdsFromReferences: jest.fn().mockResolvedValue([]),
        updateTagsReferences: jest.fn(),
      },
    },
    savedSearch: savedSearchPluginMock.createStartContract(),
    dataViews: dataPlugin.dataViews,
    timefilter: dataPlugin.query.timefilter.timefilter,
    lens: {
      EmbeddableComponent: jest.fn(() => null),
      stateHelperApi: jest.fn(() => {
        return {
          suggestions: jest.fn(),
        };
      }),
    },
    locator: {
      useUrl: jest.fn(() => ''),
      navigate: jest.fn(),
      getUrl: jest.fn(() => Promise.resolve('')),
      getLocation: jest.fn(() => Promise.resolve({ app: '', path: '' })),
      getRedirectUrl: jest.fn(() => ''),
    },
    contextLocator: { getRedirectUrl: jest.fn(() => '') },
    singleDocLocator: { getRedirectUrl: jest.fn(() => '') },
    urlTracker: createUrlTrackerMock(),
    profilesManager: profilesManagerMock,
    profileStateRegistry: new ProfileStateRegistry(),
    ebtManager: new DiscoverEBTManager(),
    cps: cpsPluginMock.createStartContract(),
    setHeaderActionMenu: jest.fn(),
    discoverShared: discoverSharedPluginMock.createStartContract(),
    discoverFeatureFlags: {
      getCascadeLayoutEnabled: jest.fn(() => false),
      getIsEsqlDefault: jest.fn(() => false),
      getEmbeddableTransformsEnabled: jest.fn(() => true),
      getEsqlApproximationEnabled: jest.fn(() => false),
    },
    embeddableEditor: {
      isByValueEditor: jest.fn(() => false),
      isEmbeddedEditor: jest.fn(() => false),
      canSaveToDashboard: jest.fn(() => false),
      transferBackToEditor: jest.fn(),
      getByValueTab: jest.fn(),
      getEmbeddableId: jest.fn(() => undefined),
      getOriginatingPath: jest.fn(() => undefined),
      clearEditorState: jest.fn(),
    },
    alertingVTwo: {
      CreateRuleOptionsFlyout: jest.fn(() => null),
    },
    trackUiMetric: jest.fn(),
    logger: { get: jest.fn(() => loggerMock.create()) },
  } as unknown as DiscoverServices;
}

export const discoverServiceMock = createDiscoverServicesMock();
