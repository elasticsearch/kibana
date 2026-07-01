/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import type { Filter } from '@kbn/es-query';
import { getInitialAppState } from './get_initial_app_state';
import { createDataViewDataSource, createEsqlDataSource } from '../../../../../common/data_sources';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { getTabStateMock } from '../redux/__mocks__/internal_state.mocks';
import { fromTabStateToSavedObjectTab } from '../redux';
import { dataViewWithTimefieldMock } from '../../../../__mocks__/data_view_with_timefield';
import type { DiscoverServices } from '../../../../build_services';
import { VIEW_MODE } from '@kbn/saved-search-plugin/common';
import { DEFAULT_COLUMNS_SETTING } from '@kbn/discover-utils';
import { DataView } from '@kbn/data-views-plugin/common';

describe('getInitialAppState', () => {
  const customQuery = {
    language: 'kuery',
    query: '_id: *',
  };

  const defaultQuery = {
    query: '*',
    language: 'kuery',
  };

  const customFilter = {
    $state: {
      store: 'appState',
    },
    meta: {
      alias: null,
      disabled: false,
      field: 'ecs.version',
      index: 'kibana-event-log-data-view',
      key: 'ecs.version',
      negate: false,
      params: {
        query: '1.8.0',
      },
      type: 'phrase',
    },
    query: {
      match_phrase: {
        'ecs.version': '1.8.0',
      },
    },
  } as Filter;

  test('should return correct output', () => {
    const services = createDiscoverServicesMock();
    const persistedTab = fromTabStateToSavedObjectTab({
      tab: getTabStateMock({
        id: 'the-saved-search-id',
        label: 'A saved search',
        appState: {
          breakdownField: 'customBreakDownField',
          hideChart: true,
          hideTable: true,
          rowsPerPage: 250,
          hideAggregatedPreview: true,
        },
        initialInternalState: {
          serializedSearchSource: {
            index: dataViewMock.id,
            filter: [customFilter],
            query: customQuery,
          },
        },
      }),
      services,
      currentDataView: undefined,
    });
    const appState = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab,
      dataView: dataViewMock,
      services,
    });
    expect(appState).toMatchObject(
      expect.objectContaining({
        breakdownField: 'customBreakDownField',
        columns: ['default_column'],
        filters: [customFilter],
        grid: {},
        hideChart: true,
        hideTable: false,
        dataSource: createDataViewDataSource({ dataViewId: 'the-data-view-id' }),
        interval: 'auto',
        query: customQuery,
        rowHeight: undefined,
        headerRowHeight: undefined,
        rowsPerPage: 250,
        hideAggregatedPreview: true,
        savedQuery: undefined,
        sort: [],
        viewMode: undefined,
      })
    );
  });

  test('should return default query if query is undefined', () => {
    const services = createDiscoverServicesMock();
    services.data.query.queryString.getDefaultQuery = jest.fn().mockReturnValue(defaultQuery);
    const persistedTab = fromTabStateToSavedObjectTab({
      tab: getTabStateMock({
        id: 'new-saved-search-id',
        label: 'A saved search',
        initialInternalState: {
          serializedSearchSource: {
            index: dataViewMock.id,
            filter: [customFilter],
            query: undefined,
          },
        },
      }),
      services,
      currentDataView: undefined,
    });
    const appState = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab,
      dataView: dataViewMock,
      services,
    });
    expect(appState).toMatchObject(
      expect.objectContaining({
        breakdownField: undefined,
        columns: ['default_column'],
        filters: [customFilter],
        grid: {},
        hideChart: false,
        dataSource: createDataViewDataSource({ dataViewId: 'the-data-view-id' }),
        interval: 'auto',
        query: defaultQuery,
        rowHeight: undefined,
        headerRowHeight: undefined,
        rowsPerPage: undefined,
        hideAggregatedPreview: undefined,
        savedQuery: undefined,
        sort: [],
        viewMode: undefined,
      })
    );
  });

  test('data view with timefield', () => {
    const services = createDiscoverServicesMock();
    const actual = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: undefined,
      dataView: dataViewWithTimefieldMock,
      services,
    });
    expect(actual).toMatchInlineSnapshot(`
      Object {
        "breakdownField": undefined,
        "columns": Array [
          "default_column",
        ],
        "dataSource": Object {
          "dataViewId": "index-pattern-with-timefield-id",
          "type": "dataView",
        },
        "density": undefined,
        "filters": undefined,
        "grid": undefined,
        "headerRowHeight": undefined,
        "hideAggregatedPreview": undefined,
        "hideChart": undefined,
        "hideSidebar": undefined,
        "hideTable": undefined,
        "interval": "auto",
        "query": Object {
          "language": "kuery",
          "query": "",
        },
        "rowHeight": undefined,
        "rowsPerPage": undefined,
        "sampleSize": undefined,
        "savedQuery": undefined,
        "sort": Array [
          Array [
            "timestamp",
            "desc",
          ],
        ],
        "viewMode": undefined,
      }
    `);
  });

  test('data view without timefield', () => {
    const services = createDiscoverServicesMock();
    const actual = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: undefined,
      dataView: dataViewMock,
      services,
    });
    expect(actual).toMatchInlineSnapshot(`
      Object {
        "breakdownField": undefined,
        "columns": Array [
          "default_column",
        ],
        "dataSource": Object {
          "dataViewId": "the-data-view-id",
          "type": "dataView",
        },
        "density": undefined,
        "filters": undefined,
        "grid": undefined,
        "headerRowHeight": undefined,
        "hideAggregatedPreview": undefined,
        "hideChart": undefined,
        "hideSidebar": undefined,
        "hideTable": undefined,
        "interval": "auto",
        "query": Object {
          "language": "kuery",
          "query": "",
        },
        "rowHeight": undefined,
        "rowsPerPage": undefined,
        "sampleSize": undefined,
        "savedQuery": undefined,
        "sort": Array [],
        "viewMode": undefined,
      }
    `);
  });

  test('should not allow both chart and table to be hidden at the same time', () => {
    const services = createDiscoverServicesMock();
    const actual = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: {
        hideChart: true,
        hideTable: true,
      },
      persistedTab: undefined,
      dataView: dataViewWithTimefieldMock,
      services,
    });

    expect(actual.hideChart).toBe(true);
    expect(actual.hideTable).toBe(false);
  });

  const getPersistedTab = ({ services }: { services: DiscoverServices }) =>
    fromTabStateToSavedObjectTab({
      tab: getTabStateMock({ id: 'mock-tab' }),
      services,
      currentDataView: undefined,
    });

  test('should set view mode correctly', () => {
    const services = createDiscoverServicesMock();
    const actualForUndefinedViewMode = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        viewMode: undefined,
      },
      dataView: dataViewMock,
      services,
    });
    expect(actualForUndefinedViewMode.viewMode).toBeUndefined();

    const actualForEsqlWithAggregatedViewMode = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        viewMode: VIEW_MODE.AGGREGATED_LEVEL,
        serializedSearchSource: { query: { esql: 'FROM test' } },
      },
      dataView: undefined,
      services,
    });
    expect(actualForEsqlWithAggregatedViewMode.viewMode).toBe(VIEW_MODE.AGGREGATED_LEVEL);

    const actualForEsqlWithInvalidPatternLevelViewMode = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        viewMode: VIEW_MODE.PATTERN_LEVEL,
        serializedSearchSource: { query: { esql: 'FROM test' } },
      },
      dataView: undefined,
      services,
    });
    expect(actualForEsqlWithInvalidPatternLevelViewMode.viewMode).toBe(VIEW_MODE.DOCUMENT_LEVEL);

    const actualForEsqlWithValidViewMode = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        viewMode: VIEW_MODE.DOCUMENT_LEVEL,
        serializedSearchSource: { query: { esql: 'FROM test' } },
      },
      dataView: undefined,
      services,
    });
    expect(actualForEsqlWithValidViewMode.viewMode).toBe(VIEW_MODE.DOCUMENT_LEVEL);
    expect(actualForEsqlWithValidViewMode.dataSource).toEqual(createEsqlDataSource());

    const actualForWithValidAggLevelViewMode = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        viewMode: VIEW_MODE.AGGREGATED_LEVEL,
      },
      dataView: dataViewMock,
      services,
    });
    expect(actualForWithValidAggLevelViewMode.viewMode).toBe(VIEW_MODE.AGGREGATED_LEVEL);
    expect(actualForWithValidAggLevelViewMode.dataSource).toEqual(
      createDataViewDataSource({ dataViewId: dataViewMock.id! })
    );

    const actualForWithValidPatternLevelViewMode = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        viewMode: VIEW_MODE.PATTERN_LEVEL,
      },
      dataView: dataViewMock,
      services,
    });
    expect(actualForWithValidPatternLevelViewMode.viewMode).toBe(VIEW_MODE.PATTERN_LEVEL);
    expect(actualForWithValidPatternLevelViewMode.dataSource).toEqual(
      createDataViewDataSource({ dataViewId: dataViewMock.id! })
    );
  });

  test('should return expected dataSource', () => {
    const services = createDiscoverServicesMock();
    const actualForEsql = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: {
        ...getPersistedTab({ services }),
        serializedSearchSource: { query: { esql: 'FROM test' } },
      },
      dataView: undefined,
      services,
    });
    expect(actualForEsql.dataSource).toMatchInlineSnapshot(`
      Object {
        "type": "esql",
      }
    `);
    const actualForDataView = getInitialAppState({
      hasGlobalState: false,
      initialUrlState: undefined,
      persistedTab: getPersistedTab({ services }),
      dataView: dataViewMock,
      services,
    });
    expect(actualForDataView.dataSource).toMatchInlineSnapshot(`
      Object {
        "dataViewId": "the-data-view-id",
        "type": "dataView",
      }
    `);
  });

  describe('when there is no persistedTab', () => {
    describe('when there is a global state', () => {
      describe('when there is a query in the url', () => {
        it('should use the query from the url state', () => {
          // Given
          const services = createDiscoverServicesMock();
          const query = { language: 'kuery', query: 'url state query' };

          // When
          const appState = getInitialAppState({
            hasGlobalState: true,
            initialUrlState: { query },
            persistedTab: undefined,
            dataView: dataViewMock,
            services,
          });

          // Then
          expect(appState).toEqual(
            expect.objectContaining({
              query,
            })
          );
        });
      });

      describe('when there is no query in the url', () => {
        it('should use the default query', () => {
          // Given
          const services = createDiscoverServicesMock();
          const dataSource = createDataViewDataSource({ dataViewId: 'some-data-view-id' });
          services.data.query.queryString.getDefaultQuery = jest.fn().mockReturnValue(defaultQuery);

          // When
          const appState = getInitialAppState({
            hasGlobalState: true,
            initialUrlState: { dataSource },
            persistedTab: undefined,
            dataView: dataViewMock,
            services,
          });

          // Then
          expect(appState).toEqual(
            expect.objectContaining({
              query: defaultQuery,
            })
          );
        });
      });
    });

    describe('when there is no global state', () => {
      describe('when there is initial url state', () => {
        describe('when there is a query in the url state', () => {
          it('should use the query from the url state', () => {
            // Given
            const services = createDiscoverServicesMock();
            const query = { language: 'kuery', query: 'url state query' };

            // When
            const appState = getInitialAppState({
              hasGlobalState: false,
              initialUrlState: { query },
              persistedTab: undefined,
              dataView: dataViewMock,
              services,
            });

            // Then
            expect(appState).toEqual(
              expect.objectContaining({
                query,
              })
            );
          });
        });

        describe('when there is no query in the url state', () => {
          it('should use the default query', () => {
            // Given
            const services = createDiscoverServicesMock();
            const dataSource = createDataViewDataSource({ dataViewId: 'some-data-view-id' });
            services.data.query.queryString.getDefaultQuery = jest
              .fn()
              .mockReturnValue(defaultQuery);

            // When
            const appState = getInitialAppState({
              hasGlobalState: false,
              initialUrlState: { dataSource },
              persistedTab: undefined,
              dataView: dataViewMock,
              services,
            });

            // Then
            expect(appState).toEqual(
              expect.objectContaining({
                query: defaultQuery,
              })
            );
          });
        });
      });

      describe('when there is no initial url state', () => {
        describe('when the query mode is esql', () => {
          it('should return an esql initial query', () => {
            // Given
            const services = createDiscoverServicesMock();
            services.storage.get = jest.fn().mockReturnValue('esql');
            services.uiSettings.get = jest.fn().mockReturnValue(true);

            // When
            const appState = getInitialAppState({
              hasGlobalState: false,
              initialUrlState: undefined,
              persistedTab: undefined,
              dataView: new DataView({
                spec: dataViewMock.toSpec(),
                fieldFormats: {} as DataView['fieldFormats'],
              }),
              services,
            });

            // Then
            expect(appState).toEqual(
              expect.objectContaining({
                query: { esql: 'FROM the-data-view-title' },
              })
            );
          });
        });

        describe('when esql default is enabled', () => {
          describe('when the query mode is unset', () => {
            it('should return an esql initial query', () => {
              // Given
              const services = createDiscoverServicesMock();
              services.storage.get = jest.fn().mockReturnValue(undefined);
              services.uiSettings.get = jest.fn().mockReturnValue(true);
              services.discoverFeatureFlags.getIsEsqlDefault = jest.fn(() => true);

              // When
              const appState = getInitialAppState({
                hasGlobalState: false,
                initialUrlState: undefined,
                persistedTab: undefined,
                dataView: new DataView({
                  spec: dataViewMock.toSpec(),
                  fieldFormats: {} as DataView['fieldFormats'],
                }),
                services,
              });

              // Then
              expect(appState).toEqual(
                expect.objectContaining({
                  query: { esql: 'FROM the-data-view-title' },
                })
              );
            });

            it('should prefer the root profile default esql query when provided', () => {
              // Given
              const services = createDiscoverServicesMock();
              services.storage.get = jest.fn().mockReturnValue(undefined);
              services.uiSettings.get = jest.fn().mockReturnValue(true);
              services.discoverFeatureFlags.getIsEsqlDefault = jest.fn(() => true);

              const defaultProfileEsqlQuery = {
                query: 'FROM test | WHERE 1 == 1',
              };

              // When
              const appState = getInitialAppState({
                hasGlobalState: false,
                initialUrlState: undefined,
                persistedTab: undefined,
                dataView: new DataView({
                  spec: dataViewMock.toSpec(),
                  fieldFormats: {} as DataView['fieldFormats'],
                }),
                services,
                defaultProfileEsqlQuery,
              });

              // Then
              expect(appState).toEqual(
                expect.objectContaining({
                  query: { esql: defaultProfileEsqlQuery.query },
                })
              );
            });

            describe('when esql uiSetting is disabled', () => {
              it('should return the default query', () => {
                // Given
                const services = createDiscoverServicesMock();
                services.storage.get = jest.fn().mockReturnValue(undefined);
                services.uiSettings.get = jest.fn().mockReturnValue(false);
                services.discoverFeatureFlags.getIsEsqlDefault = jest.fn(() => true);
                services.data.query.queryString.getDefaultQuery = jest
                  .fn()
                  .mockReturnValue(defaultQuery);

                // When
                const appState = getInitialAppState({
                  hasGlobalState: false,
                  initialUrlState: undefined,
                  persistedTab: undefined,
                  dataView: new DataView({
                    spec: dataViewMock.toSpec(),
                    fieldFormats: {} as DataView['fieldFormats'],
                  }),
                  services,
                });

                // Then
                expect(appState).toEqual(
                  expect.objectContaining({
                    query: defaultQuery,
                  })
                );
              });
            });

            describe('when dataView is not a DataView instance', () => {
              it('should return the default query', () => {
                // Given
                const services = createDiscoverServicesMock();
                services.storage.get = jest.fn().mockReturnValue(undefined);
                services.uiSettings.get = jest.fn().mockReturnValue(true);
                services.discoverFeatureFlags.getIsEsqlDefault = jest.fn(() => true);
                services.data.query.queryString.getDefaultQuery = jest
                  .fn()
                  .mockReturnValue(defaultQuery);

                // When
                const appState = getInitialAppState({
                  hasGlobalState: false,
                  initialUrlState: undefined,
                  persistedTab: undefined,
                  dataView: dataViewMock,
                  services,
                });

                // Then
                expect(appState).toEqual(
                  expect.objectContaining({
                    query: defaultQuery,
                  })
                );
              });
            });
          });
        });

        describe.each([
          { queryMode: 'esql', description: 'esql but esql is disabled' },
          { queryMode: 'classic', description: 'classic' },
          { queryMode: undefined, description: 'unset' },
        ])('when the query mode is $description', ({ queryMode }) => {
          it('should return the default query', () => {
            // Given
            const services = createDiscoverServicesMock();
            services.storage.get = jest.fn().mockReturnValue(queryMode);
            services.uiSettings.get = jest.fn().mockReturnValue(false);
            services.data.query.queryString.getDefaultQuery = jest
              .fn()
              .mockReturnValue(defaultQuery);

            // When
            const appState = getInitialAppState({
              hasGlobalState: false,
              initialUrlState: undefined,
              persistedTab: undefined,
              dataView: new DataView({
                spec: dataViewMock.toSpec(),
                fieldFormats: {} as DataView['fieldFormats'],
              }),
              services,
            });

            // Then
            expect(appState).toEqual(
              expect.objectContaining({
                query: defaultQuery,
              })
            );
          });
        });
      });
    });
  });

  describe('default sort array', () => {
    test('should use persistedTab sort array if valid and data view is provided', () => {
      const services = createDiscoverServicesMock();
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          sort: [['timestamp', 'asc']],
        },
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.sort).toEqual([['timestamp', 'asc']]);
    });

    test('should not use persistedTab sort array if invalid and data view is provided', () => {
      const services = createDiscoverServicesMock();
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          sort: [['test', 'desc']],
        },
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.sort).toEqual([['timestamp', 'desc']]);
    });

    test('should use persistedTab sort array when data view is not provided', () => {
      const services = createDiscoverServicesMock();
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          sort: [['test', 'desc']],
        },
        dataView: undefined,
        services,
      });
      expect(appState.sort).toEqual([['test', 'desc']]);
    });

    test('should use persistedTab sort array when partial data view is provided', () => {
      const services = createDiscoverServicesMock();
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          sort: [['test', 'desc']],
        },
        dataView: { id: 'partial-data-view-id', timeFieldName: 'timestamp' },
        services,
      });
      expect(appState.sort).toEqual([['test', 'desc']]);
    });
  });

  describe('default columns', () => {
    test('should use persistedTab columns if provided', () => {
      const services = createDiscoverServicesMock();
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          columns: ['column_1', 'column_2'],
        },
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.columns).toEqual(['column_1', 'column_2']);
    });

    test('should use default columns if empty columns are stored for persistedTab', () => {
      const services = createDiscoverServicesMock();
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          columns: [],
        },
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.columns).toEqual(['default_column']);
    });

    test('should use an empty array if stored as empty in persistedTab and no default columns are set in uiSettings', () => {
      const services = createDiscoverServicesMock();
      services.uiSettings.get = jest.fn().mockImplementation((key: string) => {
        if (key === DEFAULT_COLUMNS_SETTING) {
          return [];
        }
      });
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: {
          ...getPersistedTab({ services }),
          columns: [],
        },
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.columns).toEqual([]);
    });

    test('should return an empty array if provided as empty via URL and no default columns are set in uiSettings', () => {
      const services = createDiscoverServicesMock();
      services.uiSettings.get = jest.fn().mockImplementation((key: string) => {
        if (key === DEFAULT_COLUMNS_SETTING) {
          return [];
        }
      });
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: { columns: [] },
        persistedTab: undefined,
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.columns).toEqual([]);
    });

    test('should return undefined if not provided and no default columns are set in uiSettings', () => {
      const services = createDiscoverServicesMock();
      services.uiSettings.get = jest.fn().mockImplementation((key: string) => {
        if (key === DEFAULT_COLUMNS_SETTING) {
          return [];
        }
      });
      const appState = getInitialAppState({
        hasGlobalState: false,
        initialUrlState: undefined,
        persistedTab: undefined,
        dataView: dataViewWithTimefieldMock,
        services,
      });
      expect(appState.columns).toEqual(undefined);
    });
  });
});
