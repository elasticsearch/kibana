/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { action } from '@storybook/addon-actions';
import type { DataViewBase, Query } from '@kbn/es-query';
import { I18nProvider } from '@kbn/i18n-react';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';
import { buildExistsFilter } from '@kbn/es-query';
import { EuiButton, EuiComboBox } from '@elastic/eui';
import type { SearchBarWrapperProps } from '../search_bar';
import { SearchBar } from '../search_bar';
import { setIndexPatterns } from '../services';

const mockIndexPatterns = [
  {
    id: '1234',
    title: 'logstash-*',
    fields: [
      {
        name: 'bytes',
        type: 'number',
        esTypes: ['integer'],
        aggregatable: true,
        filterable: true,
        searchable: true,
      },
    ],
    getName: () => 'logstash-*',
  },
  {
    id: '1235',
    title: 'test-*',
    fields: [
      {
        name: 'response',
        type: 'number',
        esTypes: ['integer'],
        aggregatable: true,
        filterable: true,
        searchable: true,
      },
    ],
    getName: () => 'test-*',
  },
] as DataView[];

const mockTimeHistory = {
  get: () => {
    return [];
  },
  add: action('set'),
  get$: () => {
    return {
      pipe: () => {},
    };
  },
};

const createMockWebStorage = () => ({
  clear: action('clear'),
  getItem: action('getItem'),
  key: action('key'),
  removeItem: action('removeItem'),
  setItem: action('setItem'),
  length: 0,
});

const createMockStorage = () => ({
  storage: createMockWebStorage(),
  set: action('set'),
  remove: action('remove'),
  clear: action('clear'),
  get: () => true,
});

const services = {
  uiSettings: {
    get: () => {},
  },
  settings: { client: { get: () => {} } },
  notifications: action('notifications'),
  http: {
    basePath: {
      prepend: () => 'http://test',
    },
  },
  docLinks: {
    links: {
      query: {
        kueryQuerySyntax: '',
      },
    },
  },
  storage: createMockStorage(),
  data: {
    query: {
      savedQueries: {
        findSavedQueries: () =>
          Promise.resolve({
            queries: [
              {
                id: 'testwewe',
                attributes: {
                  title: 'Saved query 1',
                  description: '',
                  query: {
                    query: 'category.keyword : "Men\'s Shoes" ',
                    language: 'kuery',
                  },
                  filters: [],
                },
              },
              {
                id: '0173d0d0-b19a-11ec-8323-837d6b231b82',
                attributes: {
                  title: 'test',
                  description: '',
                  query: {
                    query: '',
                    language: 'kuery',
                  },
                  filters: [
                    {
                      meta: {
                        index: '1234',
                        alias: null,
                        negate: false,
                        disabled: false,
                        type: 'phrase',
                        key: 'category.keyword',
                        params: {
                          query: "Men's Accessories",
                        },
                      },
                      query: {
                        match_phrase: {
                          'category.keyword': "Men's Accessories",
                        },
                      },
                      $state: {
                        store: 'appState',
                      },
                    },
                  ],
                },
              },
            ],
          }),
      },
    },
    autocomplete: {
      hasQuerySuggestions: () => Promise.resolve(false),
      getQuerySuggestions: () => [],
    },
    dataViews: {
      getIdsWithTitle: () => [
        { id: '1234', title: 'logstash-*' },
        { id: '1235', title: 'test-*' },
      ],
    },
  },
  dataViewEditor: {
    userPermissions: {
      editDataView: action('editDataView'),
    },
  },
};

const defaultCapabilities = {
  savedObjectsManagement: {
    edit: true,
  },
};

setIndexPatterns({
  get: () => Promise.resolve(mockIndexPatterns[0]),
} as unknown as DataViewsContract);

function wrapSearchBarInContext(
  testProps: Partial<SearchBarWrapperProps<Query>>,
  capabilities: typeof defaultCapabilities = defaultCapabilities
) {
  const defaultOptions = {
    appName: 'test',
    timeHistory: mockTimeHistory,
    intl: null as any,
    showFilterBar: true,
    showDatePicker: true,
    showAutoRefreshOnly: false,
    showSaveQuery: true,
    showQueryInput: true,
    indexPatterns: mockIndexPatterns,
    dateRangeFrom: 'now-15m',
    dateRangeTo: 'now',
    query: { query: '', language: 'kuery' },
    filters: [],
    onClearSavedQuery: action('onClearSavedQuery'),
    onFiltersUpdated: action('onFiltersUpdated'),
  } as unknown as SearchBarWrapperProps<Query>;

  const kbnServices = {
    ...services,
    application: {
      capabilities,
    },
  };

  return (
    <I18nProvider>
      <KibanaContextProvider services={kbnServices}>
        <SearchBar<Query> {...defaultOptions} {...testProps} />
      </KibanaContextProvider>
    </I18nProvider>
  );
}

export default {
  title: 'SearchBar',
};

export const Default = {
  render: () => wrapSearchBarInContext({ showQueryInput: true } as SearchBarWrapperProps),
  name: 'default',
};

export const WithDataviewPicker = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
      },
    }),

  name: 'with dataviewPicker',
};

export const WithDataviewPickerEnhanced = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
        onAddField: action('onAddField'),
        onDataViewCreated: action('onDataViewCreated'),
      },
    }),

  name: 'with dataviewPicker enhanced',
};

export const WithFilterBarOff = {
  render: () =>
    wrapSearchBarInContext({
      showFilterBar: false,
    }),

  name: 'with filterBar off',
};

export const WithQueryInputOff = {
  render: () =>
    wrapSearchBarInContext({
      showQueryInput: false,
    }),

  name: 'with query input off',
};

export const WithDatePickerOff = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: false,
    }),

  name: 'with date picker off',
};

export const WithDisabledSaveQueryMenu = {
  render: () =>
    wrapSearchBarInContext({
      showSaveQuery: false,
    }),

  name: 'with disabled "Save query" menu',
};

export const WithHiddenManageSavedObjectsLinkInLoadSavedQueryMenu = {
  render: () =>
    wrapSearchBarInContext(
      {},
      {
        savedObjectsManagement: {
          edit: false,
        },
      }
    ),

  name: 'with hidden "Manage saved objects" link in "Load saved query" menu',
};

export const WithTheDefaultDatePickerAutoRefreshIntervalOn = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: true,
      onRefreshChange: action('onRefreshChange'),
    }),

  name: 'with the default date picker auto refresh interval on',
};

export const WithTheDefaultDatePickerAutoRefreshIntervalOff = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: true,
      isAutoRefreshDisabled: true,
    }),

  name: 'with the default date picker auto refresh interval off',
};

export const WithOnlyTheDatePickerOn = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: true,
      showFilterBar: false,
      showQueryInput: false,
    }),

  name: 'with only the date picker on',
};

export const WithAdditionalFiltersUsedForSuggestions = {
  render: () =>
    wrapSearchBarInContext({
      filtersForSuggestions: [
        buildExistsFilter({ type: 'keyword', name: 'geo.src' }, {
          id: undefined,
        } as unknown as DataViewBase),
      ],
    } as unknown as SearchBarWrapperProps),

  name: 'with additional filters used for suggestions',
};

export const WithOnlyTheFilterBarOn = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: false,
      showFilterBar: true,
      showQueryInput: false,
      filters: [
        {
          meta: {
            index: '1234',
            alias: null,
            negate: false,
            disabled: false,
            type: 'phrase',
            key: 'category.keyword',
            params: {
              query: "Men's Accessories",
            },
          },
          query: {
            match_phrase: {
              'category.keyword': "Men's Accessories",
            },
          },
          $state: {
            store: 'appState',
          },
        },
      ],
    } as unknown as SearchBarWrapperProps),

  name: 'with only the filter bar on',
};

export const WithOnlyTheQueryBarOn = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: false,
      showFilterBar: false,
      showQueryInput: true,
      query: { query: 'Test: miaou', language: 'kuery' },
    } as unknown as SearchBarWrapperProps),

  name: 'with only the query bar on',
};

export const WithQueryMenuOff = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: false,
      showFilterBar: false,
      showQueryInput: true,
      showQueryMenu: false,
      query: { query: 'Test: miaou', language: 'kuery' },
    } as unknown as SearchBarWrapperProps),

  name: 'with query menu off',
};

export const WithOnlyTheFilterBarAndTheDatePickerOn = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: true,
      showFilterBar: true,
      showQueryInput: false,
      filters: [
        {
          meta: {
            index: '1234',
            alias: null,
            negate: false,
            disabled: false,
            type: 'phrase',
            key: 'category.keyword',
            params: {
              query: "Men's Accessories",
            },
          },
          query: {
            match_phrase: {
              'category.keyword': "Men's Accessories",
            },
          },
          $state: {
            store: 'appState',
          },
        },
      ],
    } as unknown as SearchBarWrapperProps),

  name: 'with only the filter bar and the date picker on',
};

export const WithLoadedSavedQueryWithoutChanges = {
  render: () =>
    wrapSearchBarInContext({
      savedQuery: {
        id: '0173d0d0-b19a-11ec-8323-837d6b231b82',
        attributes: {
          title: 'test',
          description: '',
          query: {
            query: '',
            language: 'kuery',
          },
          filters: [
            {
              meta: {
                index: '1234',
                alias: null,
                negate: false,
                disabled: false,
                type: 'phrase',
                key: 'category.keyword',
                params: {
                  query: "Men's Accessories",
                },
              },
              query: {
                match_phrase: {
                  'category.keyword': "Men's Accessories",
                },
              },
              $state: {
                store: 'appState',
              },
            },
          ],
        },
      },
      filters: [
        {
          meta: {
            index: '1234',
            alias: null,
            negate: false,
            disabled: false,
            type: 'phrase',
            key: 'category.keyword',
            params: {
              query: "Men's Accessories",
            },
          },
          query: {
            match_phrase: {
              'category.keyword': "Men's Accessories",
            },
          },
          $state: {
            store: 'appState',
          },
        },
      ],
    } as unknown as SearchBarWrapperProps),

  name: 'with loaded saved query without changes',
};

export const WithLoadedSavedQueryWithChanges = {
  render: () =>
    wrapSearchBarInContext({
      savedQuery: {
        id: '0173d0d0-b19a-11ec-8323-837d6b231b82',
        attributes: {
          title: 'test',
          description: '',
          query: {
            query: '',
            language: 'kuery',
          },
          filters: [
            {
              meta: {
                index: '1234',
                alias: null,
                negate: false,
                disabled: false,
                type: 'phrase',
                key: 'category.keyword',
                params: {
                  query: "Men's Accessories",
                },
              },
              query: {
                match_phrase: {
                  'category.keyword': "Men's Accessories",
                },
              },
              $state: {
                store: 'appState',
              },
            },
          ],
        },
      },
    } as unknown as SearchBarWrapperProps),

  name: 'with loaded saved query with changes',
};

export const WithPrependedControls = {
  render: () =>
    wrapSearchBarInContext({
      prependFilterBar: (
        <EuiComboBox
          placeholder="Select option"
          aria-label="Select option"
          options={[
            {
              label: 'Filter 1',
            },
          ]}
          fullWidth={false}
          isClearable={true}
        />
      ),
      showQueryInput: true,
    }),

  name: 'with prepended controls',
};

export const WithoutSwitchQueryLanguage = {
  render: () =>
    wrapSearchBarInContext({
      disableQueryLanguageSwitcher: true,
    }),

  name: 'without switch query language',
};

export const ShowOnlyQueryBarWithoutSubmit = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: false,
      showFilterBar: false,
      showAutoRefreshOnly: false,
      showQueryInput: true,
      showSubmitButton: false,
    }),

  name: 'show only query bar without submit',
};

export const ShowOnlyDatepickerWithoutSubmit = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: true,
      showFilterBar: false,
      showAutoRefreshOnly: false,
      showQueryInput: false,
      showSubmitButton: false,
    }),

  name: 'show only datepicker without submit',
};

export const ShowOnlyQueryBarAndTimepickerWithoutSubmit = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: true,
      showFilterBar: false,
      showAutoRefreshOnly: false,
      showQueryInput: true,
      showSubmitButton: false,
    }),

  name: 'show only query bar and timepicker without submit',
};

export const WithFilterBarOnButPinningOptionIsHiddenFromMenus = {
  render: () =>
    wrapSearchBarInContext({
      showDatePicker: false,
      showFilterBar: true,
      showQueryInput: true,
      hiddenFilterPanelOptions: ['pinFilter'],
      filters: [
        {
          meta: {
            index: '1234',
            alias: null,
            negate: false,
            disabled: false,
            type: 'phrase',
            key: 'category.keyword',
            params: {
              query: "Men's Accessories",
            },
          },
          query: {
            match_phrase: {
              'category.keyword': "Men's Accessories",
            },
          },
          $state: {
            store: 'appState',
          },
        },
      ],
    } as unknown as SearchBarWrapperProps),

  name: 'with filter bar on but pinning option is hidden from menus',
};

export const WithDataviewPickerWithEsQl = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
        onAddField: action('onAddField'),
        onDataViewCreated: action('onDataViewCreated'),
      },
    } as SearchBarWrapperProps),

  name: 'with dataviewPicker with ES|QL',
};

export const WithDataviewPickerWithEsQlAndEsQlQuery = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'ES|QL',
          title: 'ESQL',
        },
        onChangeDataView: action('onChangeDataView'),
        onAddField: action('onAddField'),
        onDataViewCreated: action('onDataViewCreated'),
      },
      query: { esql: 'from dataview | project field1, field2' },
    } as unknown as SearchBarWrapperProps<Query>),

  name: 'with dataviewPicker with ES|QL and ES|QL query',
};

export const WithDataviewPickerWithEsQlAndLargeEsQlQuery = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'ES|QL',
          title: 'ESQL',
        },
        onChangeDataView: action('onChangeDataView'),
        onAddField: action('onAddField'),
        onDataViewCreated: action('onDataViewCreated'),
      },
      query: {
        esql: 'from dataview | project field1, field2, field 3, field 4, field 5 | where field5 > 5 | stats var = avg(field3)',
      },
    } as unknown as SearchBarWrapperProps<Query>),

  name: 'with dataviewPicker with ES|QL and large ES|QL query',
};

export const WithDataviewPickerWithEsQlAndErrorsInEsQlQuery = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'ES|QL',
          title: 'ESQL',
        },
        onChangeDataView: action('onChangeDataView'),
        onAddField: action('onAddField'),
        onDataViewCreated: action('onDataViewCreated'),
      },
      textBasedLanguageModeErrors: [
        new Error(
          '[esql] > Unexpected error from Elasticsearch: verification_exception - Found 1 problem line 1:16: Unknown column [field10]'
        ),
      ],
      query: { esql: 'from dataview | project field10' },
    } as unknown as SearchBarWrapperProps<Query>),

  name: 'with dataviewPicker with ES|QL and errors in ES|QL query',
};

export const InDisabledState = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
      },
      isDisabled: true,
    }),

  name: 'in disabled state',
};

export const NoSubmitButton = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
      },
      showSubmitButton: false,
    }),

  name: 'no submit button',
};

export const SubmitButtonAlwaysAsIcon = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
      },
      submitButtonStyle: 'iconOnly',
    }),

  name: 'submit button always as icon',
};

export const SubmitButtonAlwaysAsAFullButton = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
      },
      submitButtonStyle: 'full',
    }),

  name: 'submit button always as a full button',
};

export const WithRenderQueryInputAppendProp = {
  render: () =>
    wrapSearchBarInContext({
      dataViewPickerComponentProps: {
        currentDataViewId: '1234',
        trigger: {
          'data-test-subj': 'dataView-switch-link',
          label: 'logstash-*',
          title: 'logstash-*',
        },
        onChangeDataView: action('onChangeDataView'),
      },
      submitButtonStyle: 'full',
      renderQueryInputAppend: () => <EuiButton onClick={() => {}}>Append</EuiButton>,
    }),

  name: 'with renderQueryInputAppend prop',
};

export const WithAdditionalQueryBarMenuItems = {
  render: () =>
    wrapSearchBarInContext({
      showFilterBar: true,
      additionalQueryBarMenuItems: {
        items: [
          {
            name: 'Observability rule types',
            icon: 'logoObservability',
          },
          {
            name: 'Security rule types',
            icon: 'logoSecurity',
          },
          {
            name: 'Status',
            panel: 'status-panel',
          },
        ],
        panels: [
          {
            id: 'status-panel',
            title: 'Status',
            items: [
              {
                name: 'Active',
              },
              {
                name: 'Inactive',
              },
            ],
          },
        ],
      },
    }),

  name: 'with additional query bar menu items',
};
