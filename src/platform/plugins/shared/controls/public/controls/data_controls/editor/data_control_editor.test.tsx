/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';

import { createStubDataView } from '@kbn/data-views-plugin/common/data_view.stub';
import { stubFieldSpecMap } from '@kbn/data-views-plugin/common/field.stub';
import type { TimeRange } from '@kbn/es-query';
import { I18nProvider } from '@kbn/i18n-react';
import type { RenderResult } from '@testing-library/react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { DataControlState } from '@kbn/controls-schemas';
import { ControlValuesSource } from '@kbn/controls-constants';
import {
  getMockedOptionsListControlFactory,
  getMockedRangeSliderControlFactory,
  getMockedSearchControlFactory,
} from '../mocks/factory_mocks';

import { dataViewsService, uiActionsService } from '../../../services/kibana_services';
import { DataControlEditor } from './data_control_editor';
import type { Writable } from '@kbn/utility-types';
import type { CreateControlTypeAction } from '../../../actions/control_panel_actions';

// Stub out the ES|QL editor so we don't mount Monaco in tests; we only care about the
// surrounding editor's reaction to the values_source toggle.
jest.mock('@kbn/esql/public', () => ({
  ESQLLangEditor: () => <div data-test-subj="mock-esql-editor" />,
}));

const mockDataView = createStubDataView({
  spec: {
    id: 'logstash-*',
    fields: {
      ...stubFieldSpecMap,
      'machine.os.raw': {
        name: 'machine.os.raw',
        customLabel: 'OS',
        type: 'string',
        esTypes: ['keyword'],
        aggregatable: true,
        searchable: true,
      },
    },
    title: 'logstash-*',
    timeFieldName: '@timestamp',
  },
});

const dashboardApi = {
  timeRange$: new BehaviorSubject<TimeRange | undefined>(undefined),
  esqlVariables$: new BehaviorSubject([]),
  getEditorConfig: jest.fn(),
};

const mockRegisteredTriggerActions: CreateControlTypeAction[] = [
  getMockedSearchControlFactory({ parentApi: dashboardApi }),
  getMockedOptionsListControlFactory({ parentApi: dashboardApi }),
  getMockedRangeSliderControlFactory({ parentApi: dashboardApi }),
  {
    id: 'alphabeticalFirst',
    type: 'alphabeticalFirst',
    getIconType: () => 'lettering',
    getDisplayName: () => 'Alphabetically first',
    isCompatible: () => Promise.resolve(true),
    execute: jest.fn().mockReturnValue({
      api: dashboardApi,
      Component: <>Should be first alphabetically</>,
    }),
  },
  {
    id: 'supremeControl',
    type: 'supremeControl',
    order: 100, // force it first despite alphabetical ordering
    getIconType: () => 'starFill',
    getDisplayName: () => 'Supreme leader',
    isCompatible: () => Promise.resolve(true),
    execute: jest.fn().mockReturnValue({
      api: dashboardApi,
      Component: <>This control is forced first via the factory order</>,
    }),
  },
];

describe('Data control editor', () => {
  const mountComponent = async ({
    initialState,
    controlId,
    controlType,
    initialDefaultPanelTitle,
  }: {
    initialState?: Partial<DataControlState>;
    controlId?: string;
    controlType?: string;
    initialDefaultPanelTitle?: string;
  }) => {
    dataViewsService.get = jest.fn().mockResolvedValue(mockDataView);
    (uiActionsService as Writable<typeof uiActionsService>).getTriggerActions = jest
      .fn()
      .mockResolvedValue(mockRegisteredTriggerActions);

    const controlEditor = render(
      <I18nProvider>
        <DataControlEditor
          ariaLabelledBy="control-editor-title-input"
          onCancel={() => {}}
          onSave={() => {}}
          parentApi={dashboardApi}
          initialState={
            {
              values_source: ControlValuesSource.FIELD,
              data_view_id: mockDataView.id,
              ...initialState,
            } as Partial<DataControlState>
          }
          controlId={controlId}
          controlType={controlType}
          initialDefaultPanelTitle={initialDefaultPanelTitle}
          onUpdate={() => {}}
        />
      </I18nProvider>
    );

    await waitFor(() => {
      expect(dataViewsService.get).toHaveBeenCalledTimes(1);
    });

    return controlEditor;
  };

  const selectField = async (controlEditor: RenderResult, fieldName: string) => {
    expect(controlEditor.queryByTestId(`field-picker-select-${fieldName}`)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(controlEditor.getByTestId(`field-picker-select-${fieldName}`));
    });
  };

  const getPressedAttribute = (controlEditor: RenderResult, testId: string) => {
    return controlEditor.getByTestId(testId).getAttribute('aria-pressed');
  };

  describe('creating a new control', () => {
    test('field list does not include fields that are not compatible with any control types', async () => {
      const controlEditor = await mountComponent({});
      const nonAggOption = controlEditor.queryByTestId('field-picker-select-machine.os');
      expect(nonAggOption).not.toBeInTheDocument();
    });

    test('cannot save before selecting a field', async () => {
      const controlEditor = await mountComponent({});

      const saveButton = controlEditor.getByTestId('control-editor-save');
      expect(saveButton).toBeDisabled();
      await selectField(controlEditor, 'machine.os.raw');
      expect(saveButton).toBeEnabled();
    });

    test('CompatibleControlTypesComponent respects ordering', async () => {
      const controlEditor = await mountComponent({});
      const menu = controlEditor.getByTestId('controlTypeMenu');
      expect(menu.children.length).toEqual(5);
      expect(menu.children[0].textContent).toEqual('Supreme leader'); // forced first - ignore alphabetical sorting
      // the rest should be alphabetically sorted
      expect(menu.children[1].textContent).toEqual('Alphabetically first');
      expect(menu.children[2].textContent).toEqual('Options list');
      expect(menu.children[3].textContent).toEqual('Range slider');
      expect(menu.children[4].textContent).toEqual('Search');
    });

    test('selecting a keyword field - can only create an options list control', async () => {
      const controlEditor = await mountComponent({});
      await selectField(controlEditor, 'machine.os.raw');

      expect(controlEditor.getByTestId('create__optionsList')).toBeEnabled();
      expect(controlEditor.getByTestId('create__rangeSlider')).not.toBeEnabled();
      expect(controlEditor.getByTestId('create__search')).not.toBeEnabled();
    });

    test('selecting an IP field - can only create an options list control', async () => {
      const controlEditor = await mountComponent({});
      await selectField(controlEditor, 'clientip');

      expect(controlEditor.getByTestId('create__optionsList')).toBeEnabled();
      expect(controlEditor.getByTestId('create__rangeSlider')).not.toBeEnabled();
      expect(controlEditor.getByTestId('create__search')).not.toBeEnabled();
    });

    describe('selecting a number field', () => {
      let controlEditor: RenderResult;

      beforeEach(async () => {
        controlEditor = await mountComponent({});
        await selectField(controlEditor, 'bytes');
      });

      test('can create an options list or range slider control', () => {
        expect(controlEditor.getByTestId('create__optionsList')).toBeEnabled();
        expect(controlEditor.getByTestId('create__rangeSlider')).toBeEnabled();
        expect(controlEditor.getByTestId('create__search')).not.toBeEnabled();
      });

      test('defaults to options list creation', () => {
        expect(getPressedAttribute(controlEditor, 'create__optionsList')).toBe('true');
        expect(getPressedAttribute(controlEditor, 'create__rangeSlider')).toBe('false');
      });
    });

    test('renders custom settings when provided', async () => {
      const controlEditor = await mountComponent({});
      await selectField(controlEditor, 'machine.os.raw');
      expect(controlEditor.queryByTestId('optionsListCustomSettings')).toBeInTheDocument();
    });

    test('toggling on the ES|QL values source disables save until the query is validated', async () => {
      const controlEditor = await mountComponent({});
      await selectField(controlEditor, 'machine.os.raw');

      const saveButton = controlEditor.getByTestId('control-editor-save');
      expect(saveButton).toBeEnabled();
      expect(saveButton).not.toHaveAttribute('aria-disabled', 'true');

      await act(async () => {
        fireEvent.click(controlEditor.getByTestId('control-editor-input-esql'));
      });

      // Toggling ES|QL on requires a successful query run before the control can be saved.
      expect(saveButton).toHaveAttribute('aria-disabled', 'true');
    });
  });

  describe('editing existing control', () => {
    describe('control title', () => {
      test('auto-fills input with the default title', async () => {
        const controlEditor = await mountComponent({
          initialState: {
            field_name: 'machine.os.raw',
          },
          controlType: 'optionsList',
          controlId: 'testId',
          initialDefaultPanelTitle: 'OS',
        });
        const titleInput = await controlEditor.findByTestId('control-editor-title-input');
        expect(titleInput.getAttribute('value')).toBe('OS');
        expect(titleInput.getAttribute('placeholder')).toBe('OS');
      });

      test('auto-fills input with the custom title', async () => {
        const controlEditor = await mountComponent({
          initialState: {
            field_name: 'machine.os.raw',
            title: 'Custom title',
          },
          controlType: 'optionsList',
          controlId: 'testId',
        });
        const titleInput = await controlEditor.findByTestId('control-editor-title-input');
        expect(titleInput.getAttribute('value')).toBe('Custom title');
        expect(titleInput.getAttribute('placeholder')).toBe('machine.os.raw');
      });
    });

    test('selects the provided control type', async () => {
      const controlEditor = await mountComponent({
        initialState: {
          field_name: 'bytes',
        },
        controlType: 'rangeSlider',
        controlId: 'testId',
      });

      expect(controlEditor.getByTestId('create__optionsList')).toBeEnabled();
      expect(controlEditor.getByTestId('create__rangeSlider')).toBeEnabled();
      expect(controlEditor.getByTestId('create__search')).not.toBeEnabled();

      expect(getPressedAttribute(controlEditor, 'create__optionsList')).toBe('false');
      expect(getPressedAttribute(controlEditor, 'create__rangeSlider')).toBe('true');
      expect(getPressedAttribute(controlEditor, 'create__search')).toBe('false');
    });
  });

  describe('control editor config', () => {
    test('all elements are visible when no editor config', async () => {
      const controlEditor = await mountComponent({
        initialState: {
          field_name: 'machine.os.raw',
        },
        controlType: 'optionsList',
        controlId: 'testId',
        initialDefaultPanelTitle: 'OS',
      });

      const dataViewPicker = controlEditor.queryByTestId('control-editor-data-view-picker');
      expect(dataViewPicker).toBeInTheDocument();
      const customSettings = controlEditor.queryByTestId('control-editor-custom-settings');
      expect(customSettings).toBeInTheDocument();
      const valuesSourceSelect = controlEditor.queryByTestId('control-editor-values-source-select');
      expect(valuesSourceSelect).toBeInTheDocument();
    });

    test('can hide elements with the editor config', async () => {
      dashboardApi.getEditorConfig.mockImplementationOnce(() => ({
        hideDataViewSelector: true,
        hideAdditionalSettings: true,
        hideValuesSourceSelector: true,
      }));

      const controlEditor = await mountComponent({
        initialState: {
          field_name: 'machine.os.raw',
        },
        controlType: 'optionsList',
        controlId: 'testId',
        initialDefaultPanelTitle: 'OS',
      });

      const dataViewPicker = controlEditor.queryByTestId('control-editor-data-view-picker');
      expect(dataViewPicker).not.toBeInTheDocument();
      const customSettings = controlEditor.queryByTestId('control-editor-custom-settings');
      expect(customSettings).not.toBeInTheDocument();
      const valuesSourceSelect = controlEditor.queryByTestId('control-editor-values-source-select');
      expect(valuesSourceSelect).not.toBeInTheDocument();
    });
  });
});
