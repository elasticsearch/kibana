/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ShallowWrapper } from 'enzyme';
import { ReactWrapper } from 'enzyme';
import type { ChangeEvent } from 'react';
import React from 'react';
import { screen, act, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findTestSubject } from '@elastic/eui/lib/test';
import type { EuiListGroupItemProps, EuiComboBoxProps } from '@elastic/eui';
import { EuiComboBox, EuiListGroup, EuiRange, EuiSelect } from '@elastic/eui';
import { unifiedSearchPluginMock } from '@kbn/unified-search-plugin/public/mocks';
import { dataViewPluginMocks } from '@kbn/data-views-plugin/public/mocks';
import type { DataPublicPluginStart } from '@kbn/data-plugin/public';
import { fieldFormatsServiceMock } from '@kbn/field-formats-plugin/public/mocks';
import type { FormBasedDimensionEditorProps } from './dimension_panel';
import { FormBasedDimensionEditorComponent } from './dimension_panel';
import type { IUiSettingsClient, HttpSetup, CoreStart, NotificationsStart } from '@kbn/core/public';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import { useExistingFieldsReader } from '@kbn/unified-field-list/src/hooks/use_existing_fields';
import { generateId } from '../../../id_generator';
import { LayerTypes } from '@kbn/expression-xy-plugin/public';
import type {
  FormBasedPrivateState,
  FiltersIndexPatternColumn,
  GenericIndexPatternColumn,
  TermsIndexPatternColumn,
  OperationMetadata,
  DateHistogramIndexPatternColumn,
} from '@kbn/lens-common';
import { replaceColumn } from '../operations';
import { documentField } from '../document_field';
import { getFieldByNameFactory } from '../pure_helpers';
import { Filtering, setFilter } from './filtering';
import { TimeShift } from './time_shift';
import { ReducedTimeRange } from './reduced_time_range';
import { DimensionEditor } from './dimension_editor';
import { AdvancedOptions } from './advanced_options';
import { mountWithProviders, renderWithProviders } from '../../../test_utils/test_utils';

jest.mock('./reference_editor', () => ({
  ReferenceEditor: () => null,
}));
jest.mock('../loader');
jest.mock('@kbn/unified-search-plugin/public', () => ({
  QueryStringInput: () => null,
}));

jest.mock('../operations');

jest.mock('lodash', () => {
  const original = jest.requireActual('lodash');

  return {
    ...original,
    debounce: (fn: unknown) => fn,
  };
});
jest.mock('../../../id_generator');
// Mock the Monaco Editor component
jest.mock('../operations/definitions/formula/editor/formula_editor', () => {
  return {
    WrappedFormulaEditor: () => <div />,
    FormulaEditor: () => <div />,
  };
});

jest.mock('@kbn/unified-field-list/src/hooks/use_existing_fields', () => ({
  useExistingFieldsReader: jest.fn(() => {
    return {
      hasFieldData: (dataViewId: string, fieldName: string) => {
        return ['timestamp', 'bytes', 'memory', 'source'].includes(fieldName);
      },
    };
  }),
}));

const getFieldSelectComboBox = (wrapper: ReactWrapper) =>
  wrapper
    .find(EuiComboBox)
    .filter('[data-test-subj="indexPattern-dimension-field"]') as ReactWrapper<
    EuiComboBoxProps<string | number | string[] | undefined>
  >;

const fields = [
  {
    name: 'timestamp',
    displayName: 'timestampLabel',
    type: 'date',
    aggregatable: true,
    searchable: true,
    exists: true,
  },
  {
    name: 'bytes',
    displayName: 'bytes',
    type: 'number',
    aggregatable: true,
    searchable: true,
    exists: true,
  },
  {
    name: 'memory',
    displayName: 'memory',
    type: 'number',
    aggregatable: true,
    searchable: true,
    exists: true,
  },
  {
    name: 'source',
    displayName: 'source',
    type: 'string',
    aggregatable: true,
    searchable: true,
    exists: true,
  },
  // Added to test issue#148062 about the use of Object method names as fields name
  ...Object.getOwnPropertyNames(Object.getPrototypeOf({})).map((name) => ({
    name,
    displayName: name,
    type: 'string',
    aggregatable: true,
    searchable: true,
    exists: true,
  })),
  documentField,
];

const expectedIndexPatterns = {
  1: {
    id: '1',
    title: 'my-fake-index-pattern',
    timeFieldName: 'timestamp',
    hasExistence: true,
    hasRestrictions: false,
    fields,
    getFieldByName: getFieldByNameFactory(fields),
    getFormatterForField: () => ({ convertToText: (v: unknown) => v }),
    isPersisted: true,
    spec: {},
  },
};

const bytesColumn: GenericIndexPatternColumn = {
  label: 'Sum of bytes',
  dataType: 'number',
  isBucketed: false,

  // Private
  operationType: 'sum',
  sourceField: 'bytes',
  params: { format: { id: 'bytes' } },
};

const lastValueColumn = (
  dataType: GenericIndexPatternColumn['dataType']
): GenericIndexPatternColumn => ({
  label: 'Last value of source',
  dataType,
  isBucketed: false,
  operationType: 'last_value',
  sourceField: 'source',
  params: {},
});

/**
 * The datasource exposes four main pieces of code which are tested at
 * an integration test level. The main reason for this fairly high level
 * of testing is that there is a lot of UI logic that isn't easily
 * unit tested, such as the transient invalid state.
 *
 * - Dimension trigger: Not tested here
 * - Dimension editor component: First half of the tests
 */
describe('FormBasedDimensionEditor', () => {
  let state: FormBasedPrivateState;
  let setState: jest.Mock;
  let defaultProps: FormBasedDimensionEditorProps;

  function getStateWithColumns(columns: Record<string, GenericIndexPatternColumn>) {
    return {
      ...state,
      layers: { first: { ...state.layers.first, columns, columnOrder: Object.keys(columns) } },
    };
  }

  beforeEach(() => {
    state = {
      currentIndexPatternId: '1',
      layers: {
        first: {
          indexPatternId: '1',
          columnOrder: ['col1'],
          columns: {
            col1: {
              label: 'Date histogram of timestamp',
              customLabel: true,
              dataType: 'date',
              isBucketed: true,

              // Private
              operationType: 'date_histogram',
              params: {
                interval: '1d',
              },
              sourceField: 'timestamp',
            } as DateHistogramIndexPatternColumn,
          },
          incompleteColumns: {},
        },
      },
    };

    setState = jest.fn().mockImplementation((newState) => {
      if (wrapper instanceof ReactWrapper) {
        wrapper.setProps({
          state: typeof newState === 'function' ? newState(wrapper.prop('state')) : newState,
        });
      }
    });

    defaultProps = {
      indexPatterns: expectedIndexPatterns,
      state,
      setState,
      dateRange: { fromDate: 'now-1d', toDate: 'now' },
      columnId: 'col1',
      layerId: 'first',
      layerType: LayerTypes.DATA,
      uniqueLabel: 'stuff',
      filterOperations: () => true,
      storage: {} as IStorageWrapper,
      uiSettings: {} as IUiSettingsClient,
      http: {} as HttpSetup,
      fieldFormats: fieldFormatsServiceMock.createStartContract(),
      unifiedSearch: unifiedSearchPluginMock.createStartContract(),
      kql: kqlPluginMock.createStartContract(),
      dataViews: dataViewPluginMocks.createStartContract(),
      notifications: {} as NotificationsStart,
      data: {
        fieldFormats: {
          getType: jest.fn().mockReturnValue({
            id: 'number',
            title: 'Number',
          }),
          getDefaultType: jest.fn().mockReturnValue({
            id: 'bytes',
            title: 'Bytes',
          }),
          deserialize: jest.fn().mockReturnValue({
            convertToText: () => 'formatted',
          }),
        },
        search: {
          aggs: {
            calculateAutoTimeExpression: jest.fn(),
          },
        },
      } as unknown as DataPublicPluginStart,
      core: {} as CoreStart,
      dimensionGroups: [],
      groupId: 'a',
      isFullscreen: false,
      supportStaticValue: false,
      toggleFullscreen: jest.fn(),
      enableFormatSelector: true,
    };

    jest.clearAllMocks();
  });

  const renderDimensionPanel = (propsOverrides = {}) => {
    const rtlRender = renderWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} {...propsOverrides} />
    );

    const getVisibleFieldSelectOptions = () =>
      within(screen.getByTestId('comboBoxOptionsList indexPattern-dimension-field-optionsList'))
        .getAllByTestId('fullText')
        .map((option) => option.textContent);

    return { ...rtlRender, getVisibleFieldSelectOptions };
  };

  let wrapper: ReactWrapper | ShallowWrapper;

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount();
      wrapper = undefined as unknown as ReactWrapper | ShallowWrapper;
    }
  });

  it('should call the filterOperations function', () => {
    const filterOperations = jest.fn().mockReturnValue(true);

    renderDimensionPanel({ filterOperations });
    expect(filterOperations).toHaveBeenCalled();
  });

  it('should show field select', () => {
    renderDimensionPanel();
    expect(screen.getByTestId('indexPattern-dimension-field')).toBeInTheDocument();
  });

  it('should not show field select on fieldless operation', () => {
    renderDimensionPanel({
      state: getStateWithColumns({
        col1: {
          label: 'Filters',
          dataType: 'string',
          isBucketed: false,

          // Private
          operationType: 'filters',
          params: { filters: [] },
        } as FiltersIndexPatternColumn,
      }),
    });
    expect(screen.queryByTestId('indexPattern-dimension-field')).not.toBeInTheDocument();
  });

  it('should not show any choices if the filter returns false', async () => {
    renderDimensionPanel({
      columnId: 'col2',
      filterOperations: () => false,
    });
    await userEvent.click(screen.getByRole('button', { name: /open list of options/i }));
    expect(screen.getByText(/There aren't any options available/)).toBeInTheDocument();
  });
  it('should list all field names and document as a whole in prioritized order', async () => {
    const { getVisibleFieldSelectOptions } = renderDimensionPanel();

    const comboBoxButton = screen.getAllByTestId('comboBoxToggleListButton')[0];
    const comboBoxInput = screen.getAllByTestId('comboBoxSearchInput')[0];
    fireEvent.click(comboBoxButton);

    const allOptions = [
      'Records',
      'timestampLabel',
      'bytes',
      'memory',
      'source',
      // these fields are generated to test the issue #148062 about fields that are using JS Object method names
      ...Object.getOwnPropertyNames(Object.getPrototypeOf({})).sort(),
    ];
    expect(allOptions.slice(0, 7)).toEqual(getVisibleFieldSelectOptions());

    // press arrow up (x2) to go back to the beginning
    fireEvent.keyDown(comboBoxInput, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.keyUp(comboBoxInput, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.keyDown(comboBoxInput, { key: 'ArrowUp', code: 'ArrowUp' });
    fireEvent.keyUp(comboBoxInput, { key: 'ArrowUp', code: 'ArrowUp' });
    expect(getVisibleFieldSelectOptions()).toEqual(allOptions.slice(8));
  }, 10000);

  it('should hide fields that have no data', () => {
    (useExistingFieldsReader as jest.Mock).mockImplementationOnce(() => {
      return {
        hasFieldData: (dataViewId: string, fieldName: string) => {
          return ['timestamp', 'source'].includes(fieldName);
        },
      };
    });

    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    const options = getFieldSelectComboBox(wrapper).prop('options');
    expect(options![1].options!.map(({ label }) => label)).toEqual(['timestampLabel', 'source']);
  });

  it('should indicate fields which are incompatible for the operation of the current column', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({ col1: bytesColumn })}
      />
    );

    const options = getFieldSelectComboBox(wrapper).prop('options');

    expect(options![0]['data-test-subj']).toEqual('lns-fieldOptionIncompatible-___records___');

    expect(
      options![1].options!.filter(({ label }) => label === 'timestampLabel')[0]['data-test-subj']
    ).toContain('Incompatible');
    expect(
      options![1].options!.filter(({ label }) => label === 'memory')[0]['data-test-subj']
    ).not.toContain('Incompatible');
  });

  it('should indicate operations which are incompatible for the field of the current column', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({ col1: bytesColumn })}
      />
    );

    const items: EuiListGroupItemProps[] = wrapper.find(EuiListGroup).prop('listItems') || [];

    expect(items.find(({ id }) => id === 'min')!['data-test-subj']).not.toContain('incompatible');
    expect(items.find(({ id }) => id === 'date_histogram')!['data-test-subj']).toContain(
      'incompatible'
    );
    // Incompatible because there is no date field
    expect(items.find(({ id }) => id === 'cumulative_sum')!['data-test-subj']).toContain(
      'incompatible'
    );

    expect(items.find(({ id }) => id === 'filters')!['data-test-subj']).not.toContain(
      'incompatible'
    );
  });

  it('should indicate when a transition is invalid due to filterOperations', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({
          col1: {
            label: 'Unique count of source',
            dataType: 'number',
            isBucketed: false,
            operationType: 'unique_count',
            sourceField: 'source,',
          },
        })}
        filterOperations={(meta) => meta.dataType === 'number' && !meta.isBucketed}
      />
    );

    const items: EuiListGroupItemProps[] = wrapper.find(EuiListGroup).prop('listItems') || [];

    expect(items.find(({ id }) => id === 'min')!['data-test-subj']).toContain('incompatible');
    expect(items.find(({ id }) => id === 'cumulative_sum')!['data-test-subj']).toContain(
      'incompatible'
    );
  });

  it('should not display hidden operation types', () => {
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    const items: EuiListGroupItemProps[] = wrapper.find(EuiListGroup).prop('listItems') || [];

    ['math', 'formula', 'static_value'].forEach((hiddenOp) => {
      expect(items.some(({ id }) => id === hiddenOp)).toBe(false);
    });
  });

  it('should indicate that reference-based operations are not compatible when they are incomplete', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({
          date: {
            label: 'Date',
            dataType: 'date',
            isBucketed: true,
            operationType: 'date_histogram',
            sourceField: '@timestamp',
            params: { interval: 'auto' },
          } as DateHistogramIndexPatternColumn,
          col1: {
            label: 'Counter rate',
            dataType: 'number',
            isBucketed: false,
            operationType: 'counter_rate',
            references: ['ref'],
          },
        })}
      />
    );

    const items: EuiListGroupItemProps[] = wrapper.find(EuiListGroup).prop('listItems') || [];

    expect(items.find(({ id }) => id === 'differences')!['data-test-subj']).toContain(
      'incompatible'
    );
    expect(items.find(({ id }) => id === 'cumulative_sum')!['data-test-subj']).toContain(
      'incompatible'
    );
    expect(items.find(({ id }) => id === 'moving_average')!['data-test-subj']).toContain(
      'incompatible'
    );
  });

  it('should indicate that reference-based operations are compatible sometimes', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({
          date: {
            label: 'Date',
            dataType: 'date',
            isBucketed: true,
            operationType: 'date_histogram',
            sourceField: '@timestamp',
            params: { interval: 'auto' },
          } as DateHistogramIndexPatternColumn,
          col1: {
            label: 'Cumulative sum',
            dataType: 'number',
            isBucketed: false,
            operationType: 'cumulative_sum',
            references: ['ref'],
          },
          ref: {
            label: 'Count',
            dataType: 'number',
            isBucketed: false,
            operationType: 'count',
            sourceField: '___records___',
          },
        })}
      />
    );

    const items: EuiListGroupItemProps[] = wrapper.find(EuiListGroup).prop('listItems') || [];

    expect(items.find(({ id }) => id === 'counter_rate')!['data-test-subj']).toContain(
      'incompatible'
    );

    expect(items.find(({ id }) => id === 'differences')!['data-test-subj']).not.toContain(
      'incompatible'
    );
    expect(items.find(({ id }) => id === 'moving_average')!['data-test-subj']).not.toContain(
      'incompatible'
    );
  });

  it('should keep the operation when switching to another field compatible with this operation', async () => {
    const initialState: FormBasedPrivateState = getStateWithColumns({ col1: bytesColumn });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={initialState} />
    );

    const comboBox = getFieldSelectComboBox(wrapper);
    const option = comboBox.prop('options')![1].options!.find(({ label }) => label === 'memory')!;

    await act(async () => {
      await comboBox.prop('onChange')!([option]);
    });

    expect(setState.mock.calls[0]).toEqual([
      expect.any(Function),
      { isDimensionComplete: true, forceRender: false },
    ]);
    expect(setState.mock.calls[0][0](defaultProps.state)).toEqual({
      ...initialState,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              operationType: 'sum',
              sourceField: 'memory',
              params: { format: { id: 'bytes' } },
              // Other parts of this don't matter for this test
            }),
          },
        },
      },
    });
  });

  it('should switch operations when selecting a field that requires another operation', async () => {
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    const comboBox = getFieldSelectComboBox(wrapper);
    const option = comboBox.prop('options')![1].options!.find(({ label }) => label === 'source')!;

    await act(async () => {
      await comboBox.prop('onChange')!([option]);
    });

    expect(setState.mock.calls[0]).toEqual([
      expect.any(Function),
      { isDimensionComplete: true, forceRender: false },
    ]);
    expect(setState.mock.calls[0][0](defaultProps.state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              operationType: 'terms',
              sourceField: 'source',
              // Other parts of this don't matter for this test
            }),
          },
        },
      },
    });
  });

  it('should keep the field when switching to another operation compatible for this field', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({ col1: bytesColumn })}
      />
    );

    act(() => {
      wrapper.find('button[data-test-subj="lns-indexPatternDimension-min"]').simulate('click');
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              operationType: 'min',
              sourceField: 'bytes',
              params: { format: { id: 'bytes' }, emptyAsNull: true },
              // Other parts of this don't matter for this test
            }),
          },
        },
      },
    });
  });

  it('should not set the state if selecting the currently active operation', () => {
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    act(() => {
      wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-date_histogram"]')
        .simulate('click');
    });

    expect(setState).not.toHaveBeenCalled();
  });

  it('should update label and custom label flag on label input changes', () => {
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    act(() => {
      wrapper
        .find('input[data-test-subj="name-input"]')
        .simulate('change', { target: { value: 'New Label' } });
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function)]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              label: 'New Label',
              customLabel: true,
              // Other parts of this don't matter for this test
            }),
          },
        },
      },
    });
  });

  it('should not keep the label as long as it is the default label', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({ col1: bytesColumn })}
      />
    );

    act(() => {
      wrapper.find('button[data-test-subj="lns-indexPatternDimension-min"]').simulate('click');
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              label: 'Minimum of bytes',
            }),
          },
        },
      },
    });
  });

  it('should keep the label on operation change if it is custom', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({
          col1: {
            ...bytesColumn,
            label: 'Custom label',
            customLabel: true,
          },
        })}
      />
    );

    act(() => {
      wrapper.find('button[data-test-subj="lns-indexPatternDimension-min"]').simulate('click');
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              label: 'Custom label',
              customLabel: true,
            }),
          },
        },
      },
    });
  });

  it('should remove customLabel flag if label is set to default', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({
          col1: {
            ...bytesColumn,
            label: 'Custom label',
            customLabel: true,
          },
        })}
      />
    );

    act(() => {
      wrapper
        .find('input[data-test-subj="name-input"]')
        .simulate('change', { target: { value: 'Sum of bytes' } });
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function)]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              label: 'Sum of bytes',
              customLabel: false,
              // Other parts of this don't matter for this test
            }),
          },
        },
      },
    });
  });

  describe('transient invalid state', () => {
    it('should set the state if selecting an operation incompatible with the current field', async () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

      await act(async () => {
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });

      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](state)).toEqual({
        ...state,
        layers: {
          first: {
            ...state.layers.first,
            columns: {
              ...state.layers.first.columns,
            },
            incompleteColumns: {
              col1: { operationType: 'terms' },
            },
          },
        },
      });
    });

    it('should show error message in invalid state', () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });

      expect(
        wrapper.find('[data-test-subj="indexPattern-field-selection-row"]').first().prop('error')
      ).toBeDefined();
    });

    it('should leave error state if a compatible operation is selected', () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-date_histogram"]')
          .simulate('click');
      });

      expect(wrapper.find('[data-test-subj="indexPattern-invalid-operation"]')).toHaveLength(0);
    });

    it('should leave error state if the original operation is re-selected', () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-date_histogram"]')
          .simulate('click');
      });

      expect(wrapper.find('[data-test-subj="indexPattern-invalid-operation"]')).toHaveLength(0);
    });

    it('should leave error state when switching from incomplete state to fieldless operation', async () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

      await act(async () => {
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-filters"]')
          .simulate('click');
      });

      expect(wrapper.find('[data-test-subj="indexPattern-invalid-operation"]')).toHaveLength(0);
    });

    it('should leave error state when re-selecting the original fieldless function', () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent
          {...defaultProps}
          state={getStateWithColumns({
            col1: {
              label: 'Filter',
              dataType: 'string',
              isBucketed: true,
              // Private
              operationType: 'filters',
              params: { filters: [] },
            } as FiltersIndexPatternColumn,
          })}
        />
      );

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });

      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-filters"]')
          .simulate('click');
      });

      expect(wrapper.find('[data-test-subj="indexPattern-invalid-operation"]')).toHaveLength(0);
    });

    it('should indicate fields compatible with selected operation', async () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

      await act(async () => {
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });

      const options = getFieldSelectComboBox(wrapper).prop('options');

      expect(options![0]['data-test-subj']).toContain('Incompatible');

      expect(
        options![1].options!.filter(({ label }) => label === 'timestampLabel')[0]['data-test-subj']
      ).toContain('Incompatible');
      expect(
        options![1].options!.filter(({ label }) => label === 'source')[0]['data-test-subj']
      ).not.toContain('Incompatible');
    });

    it('should select compatible operation if field not compatible with selected operation', async () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent {...defaultProps} columnId={'col2'} />
      );

      await act(async () => {
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-average"]')
          .simulate('click');
      });

      expect(setState.mock.calls[0]).toEqual([
        expect.any(Function),
        { isDimensionComplete: false },
      ]);
      let returnedState: FormBasedPrivateState = {} as FormBasedPrivateState;
      act(() => {
        returnedState = setState.mock.calls[0][0](state);
      });
      expect(returnedState).toEqual({
        ...state,
        layers: {
          first: {
            ...state.layers.first,
            incompleteColumns: {
              col2: { operationType: 'average' },
            },
          },
        },
      });

      const comboBox = getFieldSelectComboBox(wrapper);
      const options = comboBox.prop('options');

      // options[1][2] is a `source` field of type `string` which doesn't support `average` operation
      await act(async () => {
        await comboBox.prop('onChange')!([options![1].options![2]]);
      });

      expect(setState.mock.calls[1][0](state)).toEqual({
        ...state,
        layers: {
          first: {
            ...state.layers.first,
            columns: {
              ...state.layers.first.columns,
              col2: expect.objectContaining({
                sourceField: 'source',
                operationType: 'terms',
                // Other parts of this don't matter for this test
              }),
            },
            columnOrder: ['col2', 'col1'],
          },
        },
      });
    });

    it('should keep current state and write incomplete column when transitioning from incomplete reference-based operations to field operation', () => {
      const baseState = getStateWithColumns({
        ...defaultProps.state.layers.first.columns,
        col2: {
          label: 'Counter rate',
          dataType: 'number',
          isBucketed: false,
          operationType: 'counter_rate',
          references: ['ref'],
        },
      });
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent {...defaultProps} state={baseState} columnId={'col2'} />
      );

      // Transition to a field operation (incompatible)
      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-average incompatible"]')
          .simulate('click');
      });

      // Now check that the dimension gets cleaned up on state update
      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](state)).toEqual({
        ...baseState,
        layers: {
          first: {
            ...baseState.layers.first,
            incompleteColumns: {
              col2: { operationType: 'average' },
            },
          },
        },
      });
    });

    it('should select the Records field when count is selected on non-existing column', async () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent
          {...defaultProps}
          state={getStateWithColumns({})}
          columnId="col2"
        />
      );

      await act(async () => {
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-count"]')
          .simulate('click');
      });

      const newColumnState = setState.mock.calls[0][0](state).layers.first.columns.col2;
      expect(newColumnState.operationType).toEqual('count');
      expect(newColumnState.sourceField).toEqual('___records___');
    });

    it('should indicate document and field compatibility with selected document operation', async () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent
          {...defaultProps}
          state={getStateWithColumns({
            col2: {
              dataType: 'number',
              isBucketed: false,
              label: '',
              operationType: 'count',
              sourceField: '___records___',
            },
          })}
          columnId="col2"
        />
      );
      const terms = wrapper.find(
        'button[data-test-subj="lns-indexPatternDimension-terms incompatible"]'
      );
      await act(async () => {
        await terms.simulate('click');
      });
      const options = getFieldSelectComboBox(wrapper).prop('options');
      expect(options![0]['data-test-subj']).toContain('Incompatible');
      expect(
        options![1].options!.filter(({ label }) => label === 'timestampLabel')[0]['data-test-subj']
      ).toContain('Incompatible');
      expect(
        options![1].options!.filter(({ label }) => label === 'source')[0]['data-test-subj']
      ).not.toContain('Incompatible');
    });

    it('should set datasource state if compatible field is selected for operation', async () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);
      await act(async () => {
        await wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-terms incompatible"]')
          .simulate('click');
      });
      const comboBox = getFieldSelectComboBox(wrapper);
      const option = comboBox.prop('options')![1].options!.find(({ label }) => label === 'source')!;
      await act(async () => {
        await comboBox.prop('onChange')!([option]);
      });
      expect(setState.mock.calls.length).toEqual(2);
      expect(setState.mock.calls[1]).toEqual([
        expect.any(Function),
        { isDimensionComplete: true, forceRender: false },
      ]);
      expect(setState.mock.calls[1][0](state)).toEqual({
        ...state,
        layers: {
          first: {
            ...state.layers.first,
            columns: {
              ...state.layers.first.columns,
              col1: expect.objectContaining({
                sourceField: 'source',
                operationType: 'terms',
              }),
            },
          },
        },
      });
    });
  });

  describe('time scaling', () => {
    function getProps(colOverrides: Partial<GenericIndexPatternColumn>) {
      return {
        ...defaultProps,
        state: getStateWithColumns({
          datecolumn: {
            dataType: 'date',
            isBucketed: true,
            label: '',
            customLabel: true,
            operationType: 'date_histogram',
            sourceField: 'ts',
            params: {
              interval: '1d',
            },
          } as DateHistogramIndexPatternColumn,
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: 'Count of records',
            operationType: 'count',
            sourceField: '___records___',
            ...colOverrides,
          } as GenericIndexPatternColumn,
        }),
        columnId: 'col2',
      };
    }

    it('should default to None if time scaling is not set', () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...getProps({})} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      expect(wrapper.find('[data-test-subj="indexPattern-time-scaling-enable"]')).toHaveLength(1);
      expect(
        wrapper
          .find('[data-test-subj="indexPattern-time-scaling-unit"]')
          .find(EuiSelect)
          .prop('value')
      ).toBe('');
    });

    it('should show current time scaling if set', () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent {...getProps({ timeScale: 'd' })} />
      );
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      expect(
        wrapper
          .find('[data-test-subj="indexPattern-time-scaling-unit"]')
          .find(EuiSelect)
          .prop('value')
      ).toEqual('d');
    });

    it('should allow to set time scaling initially', () => {
      const props = getProps({});
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      act(() => {
        wrapper
          .find('[data-test-subj="indexPattern-time-scaling-unit"]')
          .find(EuiSelect)
          .prop('onChange')!({
          target: { value: 's' },
        } as ChangeEvent<HTMLSelectElement>);
      });
      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeScale: 's',
                label: 'Count of records per second',
              }),
            },
          },
        },
      });
    });

    it('should carry over time scaling to other operation if possible', () => {
      const props = getProps({
        timeScale: 'h',
        sourceField: 'bytes',
        operationType: 'sum',
        label: 'Sum of bytes per hour',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper.find('button[data-test-subj="lns-indexPatternDimension-count"]').simulate('click');
      });
      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeScale: 'h',
                label: 'Count of bytes per hour',
              }),
            },
          },
        },
      });
    });

    it('should not carry over time scaling if the other operation does not support it', () => {
      const props = getProps({
        timeScale: 'h',
        sourceField: 'bytes',
        operationType: 'sum',
        label: 'Sum of bytes per hour',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper
          .find('button[data-test-subj="lns-indexPatternDimension-average"]')
          .simulate('click');
      });
      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeScale: undefined,
                label: 'Average of bytes',
              }),
            },
          },
        },
      });
    });

    it('should allow to change time scaling', () => {
      const props = getProps({ timeScale: 's', label: 'Count of records per second' });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });

      act(() => {
        wrapper
          .find('[data-test-subj="indexPattern-time-scaling-unit"] select')
          .simulate('change', {
            target: { value: 'h' },
          });
      });

      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeScale: 'h',
                label: 'Count of records per hour',
              }),
            },
          },
        },
      });
    });

    it('should not adjust label if it is custom', () => {
      const props = getProps({ timeScale: 's', customLabel: true, label: 'My label' });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper
          .find('[data-test-subj="indexPattern-time-scaling-unit"] select')
          .simulate('change', {
            target: { value: 'h' },
          });
      });
      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeScale: 'h',
                label: 'My label',
              }),
            },
          },
        },
      });
    });
  });

  describe('reduced time range', () => {
    function getProps(colOverrides: Partial<GenericIndexPatternColumn>) {
      return {
        ...defaultProps,
        state: getStateWithColumns({
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: 'Count of records',
            operationType: 'count',
            sourceField: '___records___',
            ...colOverrides,
          } as GenericIndexPatternColumn,
        }),
        columnId: 'col2',
      };
    }

    it('should not show the reduced time range component if reduced time range is not available', () => {
      const props = {
        ...defaultProps,
        state: getStateWithColumns({
          datecolumn: {
            dataType: 'date',
            isBucketed: true,
            label: '',
            customLabel: true,
            operationType: 'date_histogram',
            sourceField: 'ts',
            params: {
              interval: '1d',
            },
          } as DateHistogramIndexPatternColumn,
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: 'Count of records',
            operationType: 'count',
            sourceField: '___records___',
          } as GenericIndexPatternColumn,
        }),
        columnId: 'col2',
      };
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      expect(
        wrapper.find('[data-test-subj="indexPattern-dimension-reducedTimeRange-row"]')
      ).toHaveLength(0);
    });

    it('should show current reduced time range if set', () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent {...getProps({ reducedTimeRange: '5m' })} />
      );
      expect(
        wrapper.find(ReducedTimeRange).find(EuiComboBox).prop('selectedOptions')[0].value
      ).toEqual('5m');
    });

    it('should allow to set reduced time range initially', () => {
      const props = getProps({});
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      act(() => {
        wrapper.find(ReducedTimeRange).find(EuiComboBox).prop('onChange')!([
          { value: '1h', label: '' },
        ]);
      });
      expect((props.setState as jest.Mock).mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                reducedTimeRange: '1h',
              }),
            },
          },
        },
      });
    });

    it('should carry over reduced time range to other operation if possible', () => {
      const props = getProps({
        reducedTimeRange: '1d',
        sourceField: 'bytes',
        operationType: 'sum',
        label: 'Sum of bytes per hour',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper.find('button[data-test-subj="lns-indexPatternDimension-count"]').simulate('click');
      });
      expect((props.setState as jest.Mock).mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                reducedTimeRange: '1d',
              }),
            },
          },
        },
      });
    });

    it('should allow to change reduced time range', () => {
      const props = getProps({
        timeShift: '1d',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper.find(ReducedTimeRange).find(EuiComboBox).prop('onCreateOption')!('7m', []);
      });
      expect((props.setState as jest.Mock).mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                reducedTimeRange: '7m',
              }),
            },
          },
        },
      });
    });

    it('should report a generic error for invalid reduced time range string', () => {
      const props = getProps({
        reducedTimeRange: '5 months',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);

      expect(wrapper.find(ReducedTimeRange).find(EuiComboBox).prop('isInvalid')).toBeTruthy();

      expect(
        wrapper
          .find(ReducedTimeRange)
          .find('[data-test-subj="indexPattern-dimension-reducedTimeRange-row"]')
          .first()
          .prop('error')
      ).toBe('Time range value is not valid.');
    });
  });

  describe('time shift', () => {
    function getProps(colOverrides: Partial<GenericIndexPatternColumn>) {
      return {
        ...defaultProps,
        state: getStateWithColumns({
          datecolumn: {
            dataType: 'date',
            isBucketed: true,
            label: '',
            customLabel: true,
            operationType: 'date_histogram',
            sourceField: 'ts',
            params: {
              interval: '1d',
            },
          } as DateHistogramIndexPatternColumn,
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: 'Count of records',
            operationType: 'count',
            sourceField: '___records___',
            ...colOverrides,
          } as GenericIndexPatternColumn,
        }),
        columnId: 'col2',
      };
    }

    it('should not show the TimeShift component if time shift is not available', () => {
      const props = {
        ...defaultProps,
        state: getStateWithColumns({
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: 'Count of records',
            operationType: 'count',
            sourceField: '___records___',
          } as GenericIndexPatternColumn,
        }),
        columnId: 'col2',
      };
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent
          {...props}
          indexPatterns={{
            '1': {
              ...props.indexPatterns['1'],
              timeFieldName: undefined,
            },
          }}
        />
      );
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      expect(wrapper.find('[data-test-subj="indexPattern-time-shift-enable"]')).toHaveLength(1);
      expect(wrapper.find(TimeShift)).toHaveLength(0);
    });

    it('should show custom options if time shift is available', () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...getProps({})} />);
      expect(
        wrapper
          .find(DimensionEditor)
          .find(AdvancedOptions)
          .find('[data-test-subj="indexPattern-time-shift-enable"]')
      ).toHaveLength(1);
    });

    it('should show current time shift if set', () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent {...getProps({ timeShift: '1d' })} />
      );
      expect(wrapper.find(TimeShift).find(EuiComboBox).prop('selectedOptions')[0].value).toEqual(
        '1d'
      );
    });

    it('should allow to set time shift initially', () => {
      const props = getProps({});
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      act(() => {
        wrapper.find(TimeShift).find(EuiComboBox).prop('onChange')!([{ value: '1h', label: '' }]);
      });
      expect((props.setState as jest.Mock).mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeShift: '1h',
              }),
            },
          },
        },
      });
    });

    it('should carry over time shift to other operation if possible', () => {
      const props = getProps({
        timeShift: '1d',
        sourceField: 'bytes',
        operationType: 'sum',
        label: 'Sum of bytes per hour',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper.find('button[data-test-subj="lns-indexPatternDimension-count"]').simulate('click');
      });
      expect((props.setState as jest.Mock).mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeShift: '1d',
              }),
            },
          },
        },
      });
    });

    it('should allow to change time shift', () => {
      const props = getProps({
        timeShift: '1d',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper.find(TimeShift).find(EuiComboBox).prop('onCreateOption')!('1h', []);
      });
      expect((props.setState as jest.Mock).mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                timeShift: '1h',
              }),
            },
          },
        },
      });
    });

    it('should report a generic error for invalid shift string', () => {
      const props = getProps({
        timeShift: '5 months',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);

      expect(wrapper.find(TimeShift).find(EuiComboBox).prop('isInvalid')).toBeTruthy();

      expect(
        wrapper
          .find(TimeShift)
          .find('[data-test-subj="indexPattern-dimension-time-shift-row"]')
          .first()
          .prop('error')
      ).toBe('Time shift value is not valid.');
    });

    it('should mark absolute time shift as invalid', () => {
      const props = getProps({
        timeShift: 'startAt(2022-11-02T00:00:00.000Z)',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);

      expect(wrapper.find(TimeShift).find(EuiComboBox).prop('isInvalid')).toBeTruthy();

      expect(
        wrapper
          .find(TimeShift)
          .find('[data-test-subj="indexPattern-dimension-time-shift-row"]')
          .first()
          .prop('error')
      ).toBe('Time shift value is not valid.');
    });
  });

  describe('filtering', () => {
    function getProps(colOverrides: Partial<GenericIndexPatternColumn>) {
      return {
        ...defaultProps,
        state: getStateWithColumns({
          datecolumn: {
            dataType: 'date',
            isBucketed: true,
            label: '',
            customLabel: true,
            operationType: 'date_histogram',
            sourceField: 'ts',
            params: {
              interval: '1d',
            },
          } as DateHistogramIndexPatternColumn,
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: 'Count of records',
            operationType: 'count',
            sourceField: '___records___',
            ...colOverrides,
          } as GenericIndexPatternColumn,
        }),
        columnId: 'col2',
      };
    }

    it('should not show custom options if time scaling is not available', () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent
          {...getProps({
            operationType: 'terms',
            sourceField: 'bytes',
            params: {
              orderDirection: 'asc',
              orderBy: { type: 'alphabetical' },
              size: 5,
            },
          } as TermsIndexPatternColumn)}
        />
      );
      expect(
        wrapper.find('[data-test-subj="indexPattern-advanced-accordion"]').hostNodes()
      ).toHaveLength(0);
    });

    it('should show custom options if filtering is available', () => {
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...getProps({})} />);
      act(() => {
        findTestSubject(wrapper, 'indexPattern-advanced-accordion').simulate('click');
      });
      expect(
        wrapper.find('[data-test-subj="indexPattern-filter-by-enable"]').hostNodes()
      ).toHaveLength(1);
    });

    it('should show current filter if set', () => {
      wrapper = mountWithProviders(
        <FormBasedDimensionEditorComponent
          {...getProps({ filter: { language: 'kuery', query: 'a: b' } })}
        />
      );

      expect(
        wrapper
          .find(Filtering)
          .find('button[data-test-subj="indexPattern-filters-existingFilterTrigger"]')
          .text()
      ).toBe(`a: b`);
    });

    it('should carry over filter to other operation if possible', () => {
      const props = getProps({
        filter: { language: 'kuery', query: 'a: b' },
        sourceField: 'bytes',
        operationType: 'sum',
        label: 'Sum of bytes per hour',
      });
      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);
      act(() => {
        wrapper.find('button[data-test-subj="lns-indexPatternDimension-count"]').simulate('click');
      });
      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      expect(setState.mock.calls[0][0](props.state)).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                filter: { language: 'kuery', query: 'a: b' },
              }),
            },
          },
        },
      });
    });

    it('should allow to change filter', () => {
      const props = getProps({
        filter: { language: 'kuery', query: 'a: b' },
      });

      wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...props} />);

      act(() => {
        const { updateLayer, columnId, layer } = wrapper.find(Filtering).props();

        updateLayer(setFilter(columnId, layer, { language: 'kuery', query: 'c: d' }));
      });

      expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
      let newState = props.state;
      act(() => {
        newState = setState.mock.calls[0][0](props.state);
      });
      expect(newState).toEqual({
        ...props.state,
        layers: {
          first: {
            ...props.state.layers.first,
            columns: {
              ...props.state.layers.first.columns,
              col2: expect.objectContaining({
                filter: { language: 'kuery', query: 'c: d' },
              }),
            },
          },
        },
      });
    });
  });

  it('should render invalid field if field reference is broken', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={{
          ...defaultProps.state,
          layers: {
            first: {
              ...defaultProps.state.layers.first,
              columns: {
                col1: {
                  ...defaultProps.state.layers.first.columns.col1,
                  sourceField: 'nonexistent',
                } as DateHistogramIndexPatternColumn,
              },
            },
          },
        }}
      />
    );

    expect(wrapper.find(EuiComboBox).prop('selectedOptions')).toEqual([
      {
        label: 'nonexistent',
        value: { type: 'field', field: 'nonexistent', operationType: 'date_histogram' },
      },
    ]);
  });

  it('should support selecting the operation before the field', async () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} columnId={'col2'} />
    );
    await act(async () => {
      await wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-average"]')
        .simulate('click');
    });
    expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: false }]);
    let returnedState: FormBasedPrivateState = {} as FormBasedPrivateState;
    act(() => {
      returnedState = setState.mock.calls[0][0](defaultProps.state);
    });
    expect(returnedState).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          incompleteColumns: {
            col2: {
              operationType: 'average',
            },
          },
        },
      },
    });

    const comboBox = getFieldSelectComboBox(wrapper);
    const options = comboBox.prop('options');

    await act(async () => {
      await comboBox.prop('onChange')!([options![1].options![0]]);
    });

    expect(setState.mock.calls[1][0](defaultProps.state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columnOrder: ['col1', 'col2'],
          columns: {
            ...state.layers.first.columns,
            col2: expect.objectContaining({
              operationType: 'average',
              sourceField: 'bytes',
            }),
          },
          incompleteColumns: {},
        },
      },
    });
  });

  it('should select operation directly if only one field is possible', async () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        columnId={'col2'}
        indexPatterns={{
          1: {
            ...defaultProps.indexPatterns['1'],
            fields: defaultProps.indexPatterns['1'].fields.filter(
              (field) => field.name !== 'memory'
            ),
          },
        }}
      />
    );
    await act(async () => {
      await wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-average"]')
        .simulate('click');
    });
    expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
    let returnedState: FormBasedPrivateState = {} as FormBasedPrivateState;
    act(() => {
      returnedState = setState.mock.calls[0][0](state);
    });
    expect(returnedState).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col2: expect.objectContaining({
              sourceField: 'bytes',
              operationType: 'average',
              // Other parts of this don't matter for this test
            }),
          },
          columnOrder: ['col1', 'col2'],
        },
      },
    });
  });

  it('should select operation directly if only document is possible', async () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} columnId={'col2'} />
    );
    await act(async () => {
      await wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-count"]')
        .simulate('click');
    });
    expect(setState.mock.calls[0]).toEqual([expect.any(Function), { isDimensionComplete: true }]);
    let returnedState: FormBasedPrivateState = {} as FormBasedPrivateState;
    act(() => {
      returnedState = setState.mock.calls[0][0](state);
    });
    expect(returnedState).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col2: expect.objectContaining({
              operationType: 'count',
              // Other parts of this don't matter for this test
            }),
          },
          columnOrder: ['col1', 'col2'],
        },
      },
    });
  });

  it('should indicate compatible fields when selecting the operation first', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} columnId={'col2'} />
    );

    act(() => {
      wrapper.find('button[data-test-subj="lns-indexPatternDimension-average"]').simulate('click');
    });

    const options = getFieldSelectComboBox(wrapper).prop('options');

    expect(options![0]['data-test-subj']).toContain('Incompatible');

    expect(
      options![1].options!.filter(({ label }) => label === 'timestampLabel')[0]['data-test-subj']
    ).toContain('Incompatible');
    expect(
      options![1].options!.filter(({ label }) => label === 'bytes')[0]['data-test-subj']
    ).not.toContain('Incompatible');
    expect(
      options![1].options!.filter(({ label }) => label === 'memory')[0]['data-test-subj']
    ).not.toContain('Incompatible');
  });

  it('should indicate document compatibility when document operation is selected', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={getStateWithColumns({
          col2: {
            dataType: 'number',
            isBucketed: false,
            label: '',
            operationType: 'count',
            sourceField: '___records___',
          },
        })}
        columnId={'col2'}
      />
    );

    const options = getFieldSelectComboBox(wrapper).prop('options');

    expect(options![0]['data-test-subj']).not.toContain('Incompatible');
  });

  it('should not update when selecting the current field again', async () => {
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    const comboBox = getFieldSelectComboBox(wrapper);

    const option = comboBox
      .prop('options')![1]
      .options!.find(({ label }) => label === 'timestampLabel')!;

    await act(async () => {
      await comboBox.prop('onChange')!([option]);
    });

    expect(setState).not.toHaveBeenCalled();
  });

  it('should show all operations that are not filtered out', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        filterOperations={(op: OperationMetadata) => !op.isBucketed && op.dataType === 'number'}
      />
    );

    const items: EuiListGroupItemProps[] = wrapper.find(EuiListGroup).prop('listItems') || [];

    expect(items.map(({ id }) => id)).toEqual([
      'average',
      'count',
      'counter_rate',
      'cumulative_sum',
      'differences',
      'last_value',
      'max',
      'median',
      'min',
      'moving_average',
      'percentile',
      'percentile_rank',
      'standard_deviation',
      'sum',
      'unique_count',
      undefined,
    ]);
  });

  it('should add a column on selection of a field', async () => {
    // Prevents field format from being loaded
    setState.mockImplementation(() => {});

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} columnId={'col2'} />
    );

    const comboBox = getFieldSelectComboBox(wrapper);
    const option = comboBox.prop('options')![1].options![0];

    await act(async () => {
      await comboBox.prop('onChange')!([option]);
    });

    expect(setState.mock.calls[0]).toEqual([
      expect.any(Function),
      { isDimensionComplete: true, forceRender: false },
    ]);
    let returnedState: FormBasedPrivateState | null = null;
    act(() => {
      returnedState = setState.mock.calls[0][0](defaultProps.state);
    });

    expect(returnedState).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col2: expect.objectContaining({
              operationType: 'range',
              sourceField: 'bytes',
              // Other parts of this don't matter for this test
            }),
          },
          columnOrder: ['col1', 'col2'],
        },
      },
    });
  });

  it('should use helper function when changing the function', () => {
    const initialState: FormBasedPrivateState = getStateWithColumns({
      col1: bytesColumn,
    });
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={initialState} />
    );
    act(() => {
      wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-min"]')
        .first()
        .simulate('click');
    });

    expect(replaceColumn).toHaveBeenCalledWith(
      expect.objectContaining({
        columnId: 'col1',
        op: 'min',
        field: expect.objectContaining({ name: 'bytes' }),
      })
    );
  });

  it('should keep the latest valid dimension when removing the selection in field combobox', () => {
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);
    act(() => {
      getFieldSelectComboBox(wrapper as ReactWrapper).prop('onChange')!([]);
    });

    expect(setState).not.toHaveBeenCalled();
  });

  it('allows custom format', () => {
    const stateWithNumberCol: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Average of memory',
        dataType: 'number',
        isBucketed: false,
        // Private
        operationType: 'average',
        sourceField: 'memory',
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithNumberCol} />
    );

    act(() => {
      wrapper
        .find(EuiComboBox)
        .filter('[data-test-subj="indexPattern-dimension-format"]')
        .prop('onChange')!([{ value: 'bytes', label: 'Bytes' }]);
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function)]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              params: {
                format: { id: 'bytes', params: { decimals: 2 } },
              },
            }),
          },
        },
      },
    });
  });

  it('keeps decimal places while switching', () => {
    const stateWithNumberCol: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Average of memory',
        dataType: 'number',
        isBucketed: false,
        // Private
        operationType: 'average',
        sourceField: 'memory',
        params: {
          format: { id: 'bytes', params: { decimals: 0 } },
        },
      },
    });
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithNumberCol} />
    );

    act(() => {
      wrapper
        .find(EuiComboBox)
        .filter('[data-test-subj="indexPattern-dimension-format"]')
        .prop('onChange')!([{ value: '', label: 'Default' }]);
    });

    act(() => {
      wrapper
        .find(EuiComboBox)
        .filter('[data-test-subj="indexPattern-dimension-format"]')
        .prop('onChange')!([{ value: 'number', label: 'Number' }]);
    });

    expect(
      wrapper
        .find(EuiRange)
        .filter('[data-test-subj="indexPattern-dimension-formatDecimals"]')
        .prop('value')
    ).toEqual(0);
  });

  it('allows custom format with number of decimal places', () => {
    const stateWithNumberCol: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Average of memory',
        dataType: 'number',
        isBucketed: false,
        // Private
        operationType: 'average',
        sourceField: 'memory',
        params: {
          format: { id: 'bytes', params: { decimals: 2 } },
        },
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithNumberCol} />
    );

    act(() => {
      wrapper
        .find(EuiRange)
        .filter('[data-test-subj="indexPattern-dimension-formatDecimals"]')
        .prop('onChange')!({ currentTarget: { value: '0' } });
    });

    expect(setState.mock.calls[0]).toEqual([expect.any(Function)]);
    expect(setState.mock.calls[0][0](state)).toEqual({
      ...state,
      layers: {
        first: {
          ...state.layers.first,
          columns: {
            ...state.layers.first.columns,
            col1: expect.objectContaining({
              params: {
                format: { id: 'bytes', params: { decimals: 0 } },
              },
            }),
          },
        },
      },
    });
  });

  it('should hide the top level field selector when switching from non-reference to reference', async () => {
    (generateId as jest.Mock).mockReturnValue(`second`);
    wrapper = mountWithProviders(<FormBasedDimensionEditorComponent {...defaultProps} />);

    expect(wrapper.find('ReferenceEditor')).toHaveLength(0);

    await act(async () => {
      await wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-differences incompatible"]')
        .simulate('click');
    });

    expect(wrapper.find('ReferenceEditor')).toHaveLength(1);
  });

  it('should hide the reference editors when switching from reference to non-reference', () => {
    const stateWithReferences: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Differences of (incomplete)',
        dataType: 'number',
        isBucketed: false,
        operationType: 'differences',
        references: ['col2'],
        params: {},
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithReferences} />
    );

    expect(wrapper.find('ReferenceEditor')).toHaveLength(1);

    act(() => {
      wrapper
        .find('button[data-test-subj="lns-indexPatternDimension-average incompatible"]')
        .simulate('click');
    });

    expect(wrapper.find('ReferenceEditor')).toHaveLength(0);
  });

  it('should show a warning when the current dimension is no longer configurable', () => {
    const stateWithInvalidCol: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Invalid differences',
        dataType: 'number',
        isBucketed: false,
        operationType: 'differences',
        references: ['ref1'],
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithInvalidCol} />
    );

    expect(
      wrapper
        .find('[data-test-subj="lns-indexPatternDimension-differences incompatible"]')
        .find('EuiText[color="danger"]')
        .first()
    ).toBeTruthy();
  });

  it('should remove options to select references when there are no time fields', () => {
    const stateWithoutTime: FormBasedPrivateState = {
      ...getStateWithColumns({
        col1: {
          label: 'Avg',
          dataType: 'number',
          isBucketed: false,
          operationType: 'average',
          sourceField: 'bytes',
        },
      }),
    };

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={stateWithoutTime}
        indexPatterns={{
          1: {
            id: '1',
            title: 'my-fake-index-pattern',
            hasRestrictions: false,
            fields: [
              {
                name: 'bytes',
                displayName: 'bytes',
                type: 'number',
                aggregatable: true,
                searchable: true,
              },
            ],
            getFieldByName: getFieldByNameFactory([
              {
                name: 'bytes',
                displayName: 'bytes',
                type: 'number',
                aggregatable: true,
                searchable: true,
              },
            ]),
            getFormatterForField: () => ({ convertToText: (v: unknown) => v }),
            isPersisted: true,
            spec: {},
          },
        }}
      />
    );

    expect(wrapper.find('[data-test-subj="lns-indexPatternDimension-differences"]')).toHaveLength(
      0
    );
  });

  it('should not show tabs when formula and static_value operations are not available', () => {
    const stateWithInvalidCol: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Average of memory',
        dataType: 'number',
        isBucketed: false,
        // Private
        operationType: 'average',
        sourceField: 'memory',
        params: {
          format: { id: 'bytes', params: { decimals: 2 } },
        },
      },
    });

    const props = {
      ...defaultProps,
      filterOperations: jest.fn((op) => {
        // the formula operation will fall into this metadata category
        return !(op.dataType === 'number' && op.scale === 'ratio');
      }),
    };

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...props} state={stateWithInvalidCol} />
    );

    expect(wrapper.find('[data-test-subj="lens-dimensionTabs"]').exists()).toBeFalsy();
  });

  it('should show the formula tab when supported', () => {
    const stateWithFormulaColumn: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Formula',
        dataType: 'number',
        isBucketed: false,
        operationType: 'formula',
        references: ['ref1'],
        params: {},
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithFormulaColumn} />
    );

    expect(
      wrapper.find('[data-test-subj="lens-dimensionTabs-formula"]').first().prop('isSelected')
    ).toBeTruthy();
  });

  it('should not show the static_value tab when not supported', () => {
    const stateWithFormulaColumn: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Formula',
        dataType: 'number',
        isBucketed: false,
        operationType: 'formula',
        references: ['ref1'],
        params: {},
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithFormulaColumn} />
    );

    expect(wrapper.find('[data-test-subj="lens-dimensionTabs-static_value"]').exists()).toBeFalsy();
  });

  it('should show the static value tab when supported', () => {
    const staticWithFormulaColumn: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Formula',
        dataType: 'number',
        isBucketed: false,
        operationType: 'formula',
        references: ['ref1'],
        params: {},
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        supportStaticValue
        state={staticWithFormulaColumn}
      />
    );

    expect(
      wrapper.find('[data-test-subj="lens-dimensionTabs-static_value"]').exists()
    ).toBeTruthy();
  });

  it('should select the quick function tab by default', () => {
    const stateWithNoColumn: FormBasedPrivateState = getStateWithColumns({});

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} state={stateWithNoColumn} />
    );

    expect(
      wrapper
        .find('[data-test-subj="lens-dimensionTabs-quickFunctions"]')
        .first()
        .prop('isSelected')
    ).toBeTruthy();
  });

  it('should select the static value tab when supported by default', () => {
    const stateWithNoColumn: FormBasedPrivateState = getStateWithColumns({});

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        supportStaticValue
        state={stateWithNoColumn}
      />
    );

    expect(
      wrapper.find('[data-test-subj="lens-dimensionTabs-static_value"]').first().prop('isSelected')
    ).toBeTruthy();
  });

  it('should not show tabs and render the static value editor when staticValueOnly is set', () => {
    const stateWithNoColumn: FormBasedPrivateState = getStateWithColumns({});

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        supportStaticValue
        staticValueOnly
        state={stateWithNoColumn}
      />
    );

    expect(wrapper.find('[data-test-subj="lens-dimensionTabs"]').exists()).toBeFalsy();
    expect(
      wrapper.find('[data-test-subj="lns-indexPattern-static_value-input"]').exists()
    ).toBeTruthy();
  });

  it('should not show quick functions for an existing quick function column when staticValueOnly is set', () => {
    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent {...defaultProps} supportStaticValue staticValueOnly />
    );

    expect(wrapper.find('[data-test-subj="lens-dimensionTabs"]').exists()).toBeFalsy();
    expect(wrapper.find('[data-test-subj="indexPattern-dimension-field"]').exists()).toBeFalsy();
  });

  it('should not show any tab when formula is in full screen mode', () => {
    const stateWithFormulaColumn: FormBasedPrivateState = getStateWithColumns({
      col1: {
        label: 'Formula',
        dataType: 'number',
        isBucketed: false,
        operationType: 'formula',
        references: ['ref1'],
        params: {},
      },
    });

    wrapper = mountWithProviders(
      <FormBasedDimensionEditorComponent
        {...defaultProps}
        state={stateWithFormulaColumn}
        supportStaticValue
        isFullscreen
      />
    );

    expect(wrapper.find('[data-test-subj="lens-dimensionTabs"]').exists()).toBeFalsy();
  });

  describe('FormatSelector numeric column detection', () => {
    it('should show FormatSelector when activeData reports the column as numeric', () => {
      renderDimensionPanel({
        state: getStateWithColumns({ col1: lastValueColumn('string') }),
        activeData: {
          first: {
            type: 'datatable',
            columns: [{ id: 'col1', name: 'source', meta: { type: 'number' } }],
            rows: [],
          },
        },
      });

      expect(screen.getByTestId('indexPattern-dimension-format')).toBeInTheDocument();
    });

    it('should hide FormatSelector when activeData reports the column as non-numeric', () => {
      renderDimensionPanel({
        state: getStateWithColumns({ col1: lastValueColumn('number') }),
        activeData: {
          first: {
            type: 'datatable',
            columns: [{ id: 'col1', name: 'source', meta: { type: 'string' } }],
            rows: [],
          },
        },
      });

      expect(screen.queryByTestId('indexPattern-dimension-format')).not.toBeInTheDocument();
    });

    it('should show FormatSelector when selectedColumn dataType is numeric and activeData is not available', () => {
      renderDimensionPanel({
        state: getStateWithColumns({ col1: lastValueColumn('number') }),
      });

      expect(screen.getByTestId('indexPattern-dimension-format')).toBeInTheDocument();
    });

    it('should hide FormatSelector selectedColumn dataType is non numeric and activeData is not available', () => {
      renderDimensionPanel({
        state: getStateWithColumns({ col1: lastValueColumn('string') }),
      });

      expect(screen.queryByTestId('indexPattern-dimension-format')).not.toBeInTheDocument();
    });
  });
});
