/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ComponentProps } from 'react';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import SemVer from 'semver/classes/semver';
import { docLinksServiceMock, uiSettingsServiceMock } from '@kbn/core/public/mocks';
import { GlobalFlyout } from '@kbn/es-ui-shared-plugin/public';
import { defaultInferenceEndpoints } from '@kbn/inference-common';

import { MAJOR_VERSION } from '../../../../common';
import { useAppContext } from '../../app_context';
import { MappingsEditor } from './mappings_editor';
import { MappingsEditorProvider } from './mappings_editor_context';
import { createKibanaReactContext } from './shared_imports';
import { UseField } from './shared_imports';
import { getFieldConfig } from './lib';

jest.mock('@kbn/code-editor');

jest.mock('./components/document_fields/field_parameters/type_parameter', () => {
  const sharedImports = jest.requireActual('./shared_imports');
  const lib = jest.requireActual('./lib');
  const UseFieldActual = sharedImports.UseField as typeof UseField;
  const getFieldConfigActual = lib.getFieldConfig as typeof getFieldConfig;

  const options = [
    { value: 'text', label: 'text' },
    { value: 'semantic_text', label: 'semantic_text' },
    { value: 'other', label: 'other' },
    { value: 'range', label: 'range' },
    { value: 'date_range', label: 'date_range' },
  ];

  const TypeParameter = () => (
    <UseFieldActual path="type" config={getFieldConfigActual('type')}>
      {(field: unknown) => {
        const f = field as {
          value?: Array<{ value?: string }>;
          setValue: (value: unknown) => void;
        };

        return (
          <select
            data-test-subj="fieldType"
            defaultValue={f.value?.[0]?.value ?? ''}
            onBlur={(e) => f.setValue([{ value: e.target.value, label: e.target.value }])}
          >
            <option value="" />
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      }}
    </UseFieldActual>
  );

  return { __esModule: true, TypeParameter };
});

jest.mock('./components/document_fields/field_parameters/reference_field_selects', () => {
  const sharedImports = jest.requireActual('./shared_imports');
  const lib = jest.requireActual('./lib');
  const UseFieldActual = sharedImports.UseField as typeof UseField;
  const getFieldConfigActual = lib.getFieldConfig as typeof getFieldConfig;

  const ReferenceFieldSelects = () => (
    <UseFieldActual path="reference_field" config={getFieldConfigActual('reference_field')}>
      {(field: unknown) => {
        const f = field as { value?: string; setValue: (value: unknown) => void };
        return (
          <div data-test-subj="referenceFieldSelect">
            <select
              data-test-subj="referenceFieldSelectInput"
              defaultValue={f.value ?? ''}
              onBlur={(e) => f.setValue(e.target.value)}
            >
              <option value="" />
              <option value="title">title</option>
            </select>
          </div>
        );
      }}
    </UseFieldActual>
  );

  return { __esModule: true, ReferenceFieldSelects };
});

jest.mock('../../app_context', () => {
  const actual = jest.requireActual('../../app_context');
  return {
    ...actual,
    useAppContext: jest.fn(),
  };
});

interface MockSelectInferenceIdContentProps {
  dataTestSubj?: string;
  value: string;
  setValue: (value: string) => void;
}

const MockSelectInferenceIdContent: React.FC<MockSelectInferenceIdContentProps> = ({
  dataTestSubj,
  value,
  setValue,
}) => {
  React.useEffect(() => {
    if (!value) setValue(defaultInferenceEndpoints.ELSER);
  }, [value, setValue]);

  return <div data-test-subj={dataTestSubj ?? 'mockSelectInferenceId'} />;
};

function mockSelectInferenceId({ 'data-test-subj': dataTestSubj }: { 'data-test-subj'?: string }) {
  const config = getFieldConfig('inference_id');
  return (
    <UseField path="inference_id" fieldConfig={config}>
      {(field) => (
        <MockSelectInferenceIdContent
          dataTestSubj={dataTestSubj}
          value={field.value as string}
          setValue={field.setValue}
        />
      )}
    </UseField>
  );
}

jest.mock('./components/document_fields/field_parameters/select_inference_id', () => ({
  SelectInferenceId: mockSelectInferenceId,
}));

jest.mock('../component_templates/component_templates_context', () => ({
  useComponentTemplatesContext: jest.fn().mockReturnValue({
    toasts: {
      addError: jest.fn(),
      addSuccess: jest.fn(),
    },
  }),
}));

const { GlobalFlyoutProvider } = GlobalFlyout;
const mockUseAppContext = useAppContext as unknown as jest.MockedFunction<typeof useAppContext>;
const docLinks = docLinksServiceMock.createStartContract();
const kibanaVersion = new SemVer(MAJOR_VERSION);
const { Provider: KibanaReactContextProvider } = createKibanaReactContext({
  uiSettings: uiSettingsServiceMock.createSetupContract(),
  kibanaVersion: {
    get: () => kibanaVersion,
  },
});
const defaultAppContext = {
  config: { enableMappingsSourceFieldSection: true },
  canUseSyntheticSource: true,
};

type MappingsEditorTestProps = Omit<
  ComponentProps<typeof MappingsEditor>,
  'docLinks' | 'esNodesPlugins'
>;

const renderMappingsEditor = (
  props: Partial<MappingsEditorTestProps>,
  ctx: unknown = defaultAppContext
) => {
  mockUseAppContext.mockReturnValue(ctx as unknown as ReturnType<typeof useAppContext>);
  const { onChange, ...restProps } = props;
  const mergedProps = {
    ...restProps,
    docLinks,
    esNodesPlugins: [],
    onChange: onChange ?? (() => undefined),
  } satisfies ComponentProps<typeof MappingsEditor>;
  return render(
    <I18nProvider>
      <KibanaReactContextProvider>
        <MappingsEditorProvider>
          <GlobalFlyoutProvider>
            <MappingsEditor {...mergedProps} />
          </GlobalFlyoutProvider>
        </MappingsEditorProvider>
      </KibanaReactContextProvider>
    </I18nProvider>
  );
};

describe('Mappings editor', () => {
  describe('core', () => {
    interface TestMappings {
      dynamic?: boolean;
      numeric_detection?: boolean;
      date_detection?: boolean;
      dynamic_date_formats?: unknown;
      properties?: Record<string, Record<string, unknown>>;
      dynamic_templates?: unknown[];
      _source?: { enabled?: boolean; includes?: string[]; excludes?: string[] };
      _meta?: Record<string, unknown>;
      _routing?: { required?: boolean };
      [key: string]: unknown;
    }

    let data: TestMappings | undefined;
    let onChangeHandler: jest.Mock = jest.fn();

    type MappingsEditorProps = ComponentProps<typeof MappingsEditor>;

    const setup = (
      props: Partial<MappingsEditorProps>,
      ctx: unknown = {
        config: { enableMappingsSourceFieldSection: true },
        canUseSyntheticSource: true,
      }
    ) => {
      return renderMappingsEditor({ onChange: onChangeHandler, ...props }, ctx);
    };

    const selectTab = async (tabName: string) => {
      const tabMap: Record<string, string> = {
        fields: 'Mapped fields',
        runtimeFields: 'Runtime fields',
        templates: 'Dynamic templates',
        advanced: 'Advanced options',
      };
      const tab = screen.getByRole('tab', { name: tabMap[tabName] });
      fireEvent.click(tab);
      await waitFor(() => expect(tab).toHaveAttribute('aria-selected', 'true'));
    };

    const addField = async (
      name: string,
      type: string,
      subType?: string,
      referenceField?: string
    ) => {
      // Fill name
      const nameInput = screen.getByTestId('nameParameterInput');
      fireEvent.change(nameInput, { target: { value: name } });

      // Select type using a lightweight mock (avoid EuiComboBox portal cost)
      const typeSelect = screen.getByTestId('fieldType');
      fireEvent.change(typeSelect, { target: { value: type } });
      fireEvent.blur(typeSelect);

      if (subType !== undefined && type === 'other') {
        const subTypeInput = await screen.findByTestId('fieldSubType');
        fireEvent.change(subTypeInput, { target: { value: subType } });
      }

      if (referenceField !== undefined) {
        // Wait for reference field to appear after semantic_text type is selected
        const referenceSelect = await screen.findByTestId('referenceFieldSelectInput');
        fireEvent.change(referenceSelect, { target: { value: referenceField } });
        fireEvent.blur(referenceSelect);
      }

      const addButton = screen.getByTestId('addButton');
      fireEvent.click(addButton);

      // Root-level fields use data-test-subj `fieldsListItem ${name}Field`
      await screen.findByTestId(`fieldsListItem ${name}Field`);

      const cancelButton = await screen.findByTestId('cancelButton');
      fireEvent.click(cancelButton);

      await waitFor(() => expect(screen.queryByTestId('createFieldForm')).not.toBeInTheDocument());
    };

    const updateJsonEditor = (testSubj: string, value: object) => {
      // Strip prefix - form doesn't create hierarchical test subjects
      const actualTestSubj = testSubj.replace(/^advancedConfiguration\./, '');
      const editor = screen.getByTestId(actualTestSubj);
      fireEvent.change(editor, { target: { value: JSON.stringify(value) } });
    };

    const getJsonEditorValue = (testSubj: string) => {
      // Strip prefix - form doesn't create hierarchical test subjects
      const actualTestSubj = testSubj.replace(/^advancedConfiguration\./, '');
      const editor = screen.getByTestId(actualTestSubj);
      const attributeValue = editor.getAttribute('data-currentvalue');
      const inputValue = (editor as HTMLInputElement).value;
      const value = typeof attributeValue === 'string' ? attributeValue : inputValue;

      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return { errorParsingJson: true };
        }
      }
      return value;
    };

    const getToggleValue = (testSubj: string): boolean => {
      // Strip 'advancedConfiguration.' prefix if present - form doesn't create hierarchical test subjects
      const actualTestSubj = testSubj.replace(/^advancedConfiguration\./, '');

      // Handle hierarchical test subjects like 'dynamicMappingsToggle.input'
      if (actualTestSubj.includes('.')) {
        const [formRowId, inputId] = actualTestSubj.split('.');
        const formRow = screen.getByTestId(formRowId);
        const toggle = within(formRow).getByTestId(inputId);
        return toggle.getAttribute('aria-checked') === 'true';
      }

      const toggle = screen.getByTestId(actualTestSubj);
      return toggle.getAttribute('aria-checked') === 'true';
    };

    const getComboBoxValue = (testSubj: string) => {
      // Strip prefixes - sourceField is not hierarchical in DOM
      const actualTestSubj = testSubj.replace(/^(advancedConfiguration|sourceField)\./, '');
      const comboBoxContainer = screen.getByTestId(actualTestSubj);

      // Real EuiComboBox renders selected options as pills with data-test-subj="euiComboBoxPill"
      const pills = within(comboBoxContainer).queryAllByTestId('euiComboBoxPill');
      return pills.map((pill) => pill.textContent || '');
    };

    const toggleEuiSwitch = async (testSubj: string) => {
      // Strip prefix - form doesn't create hierarchical test subjects
      const actualTestSubj = testSubj.replace(/^advancedConfiguration\./, '');

      // Handle hierarchical test subjects like 'dynamicMappingsToggle.input'
      let toggle;
      if (actualTestSubj.includes('.')) {
        const [formRowId, inputId] = actualTestSubj.split('.');
        const formRow = screen.getByTestId(formRowId);
        toggle = within(formRow).getByTestId(inputId);
      } else {
        toggle = screen.getByTestId(actualTestSubj);
      }

      fireEvent.click(toggle);
      await waitFor(() => {
        const newState = toggle.getAttribute('aria-checked');
        expect(newState).toBeDefined();
      });
    };

    beforeEach(() => {
      jest.clearAllMocks();
      onChangeHandler = jest.fn();
    });

    test('default behaviour', async () => {
      const defaultMappings = {
        properties: {
          user: {
            // No type defined for user
            properties: {
              name: { type: 'text' },
            },
          },
        },
      };

      setup({ value: defaultMappings, onChange: onChangeHandler });

      await screen.findByTestId('mappingsEditor');

      const expectedMappings = {
        ...defaultMappings,
        properties: {
          user: {
            type: 'object', // Was not defined so it defaults to "object" type
            ...defaultMappings.properties.user,
          },
        },
      };

      // Verify onChange was called with expected mappings
      expect(onChangeHandler).toHaveBeenCalled();
      const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
      data = lastCall.getData(lastCall.isValid ?? true);
      expect(data).toEqual(expectedMappings);
    });

    describe('multiple mappings detection', () => {
      test('should show a warning when multiple mappings are detected', async () => {
        const value = {
          type1: {
            properties: {
              name1: {
                type: 'keyword',
              },
            },
          },
          type2: {
            properties: {
              name2: {
                type: 'keyword',
              },
            },
          },
        };

        setup({ onChange: onChangeHandler, value });

        await screen.findByTestId('mappingsEditor');

        expect(screen.getByTestId('mappingTypesDetectedCallout')).toBeInTheDocument();
        expect(screen.queryByTestId('documentFields')).not.toBeInTheDocument();
      });

      test('should not show a warning when mappings a single-type', async () => {
        const value = {
          properties: {
            name1: {
              type: 'keyword',
            },
          },
        };

        setup({ onChange: onChangeHandler, value });

        await screen.findByTestId('mappingsEditor');

        expect(screen.queryByTestId('mappingTypesDetectedCallout')).not.toBeInTheDocument();
        expect(screen.getByTestId('documentFields')).toBeInTheDocument();
      });
    });

    describe('tabs', () => {
      const defaultMappings = {
        properties: {},
        dynamic_templates: [{ before: 'foo' }],
      };

      const ctx = {
        config: {
          enableMappingsSourceFieldSection: false,
        },
        canUseSyntheticSource: false,
      };

      test('should have 4 tabs (fields, runtime, template, advanced settings)', async () => {
        setup({ value: defaultMappings, onChange: onChangeHandler }, ctx);
        await screen.findByTestId('mappingsEditor');

        const tabs = screen.getAllByRole('tab');
        const tabTexts = tabs.map((tab) => tab.textContent);

        expect(tabTexts).toEqual([
          'Mapped fields',
          'Runtime fields',
          'Dynamic templates',
          'Advanced options',
        ]);
      });

      const openCreateFieldForm = async () => {
        const addFieldButton = screen.getByTestId('addFieldButton');
        fireEvent.click(addFieldButton);
        await screen.findByTestId('createFieldForm');
      };

      test('keeps mapped fields when switching tabs', async () => {
        setup({ value: defaultMappings, onChange: onChangeHandler }, ctx);
        await screen.findByTestId('mappingsEditor');

        // Start with empty fields list
        expect(screen.queryByTestId('fieldsListItem JohnField')).not.toBeInTheDocument();

        await openCreateFieldForm();
        const newField = { name: 'John', type: 'text' };
        await addField(newField.name, newField.type);

        // Switch away and back
        await selectTab('templates');
        await selectTab('fields');
        expect(await screen.findByTestId('fieldsListItem JohnField')).toBeInTheDocument();
      });

      test('keeps dynamic templates edits when switching tabs', async () => {
        setup({ value: defaultMappings, onChange: onChangeHandler }, ctx);
        await screen.findByTestId('mappingsEditor');

        await selectTab('templates');

        const updatedValueTemplates = [{ after: 'bar' }];
        updateJsonEditor('dynamicTemplatesEditor', updatedValueTemplates);
        expect(getJsonEditorValue('dynamicTemplatesEditor')).toEqual(updatedValueTemplates);

        // Switch to a lightweight tab and back (avoid rendering advanced options)
        await selectTab('fields');
        await selectTab('templates');

        expect(getJsonEditorValue('dynamicTemplatesEditor')).toEqual(updatedValueTemplates);
      });

      test('keeps advanced settings edits when switching tabs', async () => {
        setup({ value: defaultMappings, onChange: onChangeHandler }, ctx);
        await screen.findByTestId('mappingsEditor');

        await selectTab('advanced');

        expect(getToggleValue('advancedConfiguration.dynamicMappingsToggle.input')).toBe(true);
        expect(screen.queryByTestId('numericDetection')).toBeInTheDocument();

        await toggleEuiSwitch('advancedConfiguration.dynamicMappingsToggle.input');

        expect(getToggleValue('advancedConfiguration.dynamicMappingsToggle.input')).toBe(false);
        expect(screen.queryByTestId('numericDetection')).not.toBeInTheDocument();

        // Switch to a lightweight tab and back (avoid JSON editor work)
        await selectTab('runtimeFields');
        await selectTab('advanced');

        expect(getToggleValue('advancedConfiguration.dynamicMappingsToggle.input')).toBe(false);
        expect(screen.queryByTestId('numericDetection')).not.toBeInTheDocument();
      });

      test('should keep default dynamic templates value when switching tabs', async () => {
        setup(
          {
            value: { ...defaultMappings, dynamic_templates: [] }, // by default, the UI will provide an empty array for dynamic templates
            onChange: onChangeHandler,
          },
          ctx
        );

        await screen.findByTestId('mappingsEditor');

        // Navigate to dynamic templates tab and verify empty array
        await selectTab('templates');
        let templatesValue = getJsonEditorValue('dynamicTemplatesEditor');
        expect(templatesValue).toEqual([]);

        // Navigate to advanced tab
        await selectTab('advanced');

        // Navigate back to dynamic templates tab and verify empty array persists
        await selectTab('templates');
        templatesValue = getJsonEditorValue('dynamicTemplatesEditor');
        expect(templatesValue).toEqual([]);
      });
    });

    describe('component props', () => {
      /**
       * Note: the "indexSettings" prop will be tested along with the "analyzer" parameter on a text datatype field,
       * as it is the only place where it is consumed by the mappings editor.
       * The test that covers it is in the "text_datatype.test.tsx": "analyzer parameter: custom analyzer (from index settings)"
       */
      let defaultMappings: TestMappings;

      const ctx = {
        config: {
          enableMappingsSourceFieldSection: true,
        },
        canUseSyntheticSource: true,
      };

      beforeEach(() => {
        defaultMappings = {
          dynamic: true,
          numeric_detection: false,
          date_detection: true,
          properties: {
            title: { type: 'text' },
            address: {
              type: 'object',
              properties: {
                street: { type: 'text' },
                city: { type: 'text' },
              },
            },
          },
          dynamic_templates: [{ initial: 'value' }],
          _source: {
            enabled: true,
            includes: ['field1', 'field2'],
            excludes: ['field3'],
          },
          _meta: {
            some: 'metaData',
          },
          _routing: {
            required: false,
          },
          subobjects: true,
        };
      });

      describe('props.value and props.onChange', () => {
        beforeEach(async () => {
          setup({ value: defaultMappings, onChange: onChangeHandler }, ctx);
          await screen.findByTestId('mappingsEditor');
        });

        test('props.value => should prepopulate the editor data', async () => {
          // Mapped fields
          // Test that root-level mappings "properties" are rendered as root-level "DOM tree items"
          const fieldElements = screen.getAllByTestId(/^fieldsListItem/);
          const fields = fieldElements.map((el) => within(el).getByTestId(/fieldName/).textContent);
          expect(fields.sort()).toEqual(Object.keys(defaultMappings.properties!).sort());

          // Dynamic templates
          await selectTab('templates');

          // Test that dynamic templates JSON is rendered in the templates editor
          const templatesValue = getJsonEditorValue('dynamicTemplatesEditor');
          expect(templatesValue).toEqual(defaultMappings.dynamic_templates);

          // Advanced settings
          await selectTab('advanced');

          const isDynamicMappingsEnabled = getToggleValue(
            'advancedConfiguration.dynamicMappingsToggle.input'
          );
          expect(isDynamicMappingsEnabled).toBe(defaultMappings.dynamic);

          const isNumericDetectionEnabled = getToggleValue(
            'advancedConfiguration.numericDetection.input'
          );
          expect(isNumericDetectionEnabled).toBe(defaultMappings.numeric_detection);

          expect(getComboBoxValue('sourceField.includesField')).toEqual(
            defaultMappings._source!.includes
          );
          expect(getComboBoxValue('sourceField.excludesField')).toEqual(
            defaultMappings._source!.excludes
          );

          const metaFieldValue = getJsonEditorValue('advancedConfiguration.metaField');
          expect(metaFieldValue).toEqual(defaultMappings._meta);

          const isRoutingRequired = getToggleValue(
            'advancedConfiguration.routingRequiredToggle.input'
          );
          expect(isRoutingRequired).toBe(defaultMappings._routing!.required);
        });

        test('props.onChange() => forwards mapped field changes', async () => {
          const addFieldButton = screen.getByTestId('addFieldButton');
          fireEvent.click(addFieldButton);
          await screen.findByTestId('createFieldForm');

          const newField = { name: 'someNewField', type: 'text' };
          await addField(newField.name, newField.type);

          const expectedMappings = {
            ...defaultMappings,
            properties: {
              ...defaultMappings.properties,
              [newField.name]: { type: 'text' },
            },
          };

          await waitFor(() => {
            expect(onChangeHandler).toHaveBeenCalled();
            const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
            data = lastCall.getData(lastCall.isValid ?? true);
            expect(data).toEqual(expectedMappings);
          });
        });

        test('props.onChange() => forwards dynamic templates changes', async () => {
          await selectTab('templates');

          const updatedTemplatesValue = [{ someTemplateProp: 'updated' }];
          updateJsonEditor('dynamicTemplatesEditor', updatedTemplatesValue);

          const expectedMappings = {
            ...defaultMappings,
            dynamic_templates: updatedTemplatesValue,
          };

          await waitFor(() => {
            expect(onChangeHandler).toHaveBeenCalled();
            const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
            data = lastCall.getData(lastCall.isValid ?? true);
            expect(data).toEqual(expectedMappings);
          });
        });

        test('props.onChange() => forwards advanced settings changes', async () => {
          await selectTab('advanced');

          await toggleEuiSwitch('advancedConfiguration.dynamicMappingsToggle.input');

          const expectedMappings = {
            ...defaultMappings,
            dynamic: false,
            // The "enabled": true is removed as this is the default in Es
            _source: {
              includes: defaultMappings._source!.includes,
              excludes: defaultMappings._source!.excludes,
            },
          };
          delete expectedMappings.date_detection;
          delete expectedMappings.dynamic_date_formats;
          delete expectedMappings.numeric_detection;

          await waitFor(() => {
            expect(onChangeHandler).toHaveBeenCalled();
            const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
            data = lastCall.getData(lastCall.isValid ?? true);
            expect(data).toEqual(expectedMappings);
          });
        });
      }); // Close inner describe for props.value and props.onChange

      describe('semantic_text field tests', () => {
        beforeEach(async () => {
          setup({ value: defaultMappings, onChange: onChangeHandler }, ctx);
          await screen.findByTestId('mappingsEditor');
        });

        test('updates mapping without inference id for semantic_text field', async () => {
          let updatedMappings = { ...defaultMappings };

          // Mapped fields
          const addFieldButton = screen.getByTestId('addFieldButton');
          fireEvent.click(addFieldButton);

          await screen.findByTestId('createFieldForm');

          const newField = { name: 'someNewField', type: 'semantic_text' };
          await addField(newField.name, newField.type);

          updatedMappings = {
            ...updatedMappings,
            properties: {
              ...updatedMappings.properties,
              [newField.name]: {
                inference_id: defaultInferenceEndpoints.ELSER,
                type: 'semantic_text',
              },
            },
          };

          await waitFor(() => {
            expect(onChangeHandler).toHaveBeenCalled();
            const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
            data = lastCall.getData(lastCall.isValid ?? true);
            expect(data).toEqual(updatedMappings);
          });
        });

        test('updates mapping with reference field value for semantic_text field', async () => {
          let updatedMappings = { ...defaultMappings };

          // Mapped fields - Use an existing text field as reference
          const addFieldButton = screen.getByTestId('addFieldButton');
          fireEvent.click(addFieldButton);

          await screen.findByTestId('createFieldForm');

          const newField = {
            name: 'someNewField',
            type: 'semantic_text',
            referenceField: 'title',
          };

          await addField(newField.name, newField.type, undefined, newField.referenceField);

          updatedMappings = {
            ...updatedMappings,
            properties: {
              ...updatedMappings.properties,
              title: {
                type: 'text',
                copy_to: ['someNewField'],
              },
              [newField.name]: {
                inference_id: defaultInferenceEndpoints.ELSER,
                type: 'semantic_text',
              },
            },
          };

          await waitFor(() => {
            expect(onChangeHandler).toHaveBeenCalled();
            const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
            data = lastCall.getData(lastCall.isValid ?? true);
            expect(data).toEqual(updatedMappings);
          });
        });
      });

      describe('props.indexMode sets the correct default value of _source field', () => {
        it("defaults to 'stored' with 'standard' index mode prop", async () => {
          setup(
            {
              value: { ...defaultMappings, _source: undefined },
              onChange: onChangeHandler,
              indexMode: 'standard',
            },
            ctx
          );

          await screen.findByTestId('mappingsEditor');

          await selectTab('advanced');

          const sourceValueButton = screen.getByTestId('sourceValueField');
          expect(sourceValueButton.textContent).toContain('Stored _source');
        });

        (['logsdb', 'time_series'] as const).forEach((indexMode) => {
          it(`defaults to 'synthetic' with ${indexMode} index mode prop when 'canUseSyntheticSource' is set to true`, async () => {
            setup(
              {
                value: { ...defaultMappings, _source: undefined },
                onChange: onChangeHandler,
                indexMode,
              },
              ctx
            );

            await screen.findByTestId('mappingsEditor');

            await selectTab('advanced');

            await waitFor(() => {
              const sourceValueButton = screen.getByTestId('sourceValueField');
              expect(sourceValueButton.textContent).toContain('Synthetic _source');
            });
          });

          it(`defaults to 'standard' with ${indexMode} index mode prop when 'canUseSyntheticSource' is set to true`, async () => {
            setup(
              {
                value: { ...defaultMappings, _source: undefined },
                onChange: onChangeHandler,
                indexMode,
              },
              { ...ctx, canUseSyntheticSource: false }
            );

            await screen.findByTestId('mappingsEditor');

            await selectTab('advanced');

            const sourceValueButton = screen.getByTestId('sourceValueField');
            expect(sourceValueButton.textContent).toContain('Stored _source');
          });
        });
      });
    });

    describe('multi-fields support', () => {
      it('allows multi-fields for most types', async () => {
        const value = {
          properties: {
            name1: {
              type: 'wildcard',
            },
          },
        };

        setup({ onChange: onChangeHandler, value });

        await screen.findByTestId('mappingsEditor');

        expect(screen.getByTestId('addMultiFieldButton')).toBeInTheDocument();
      });

      it('keeps the fields property in the field', async () => {
        const value = {
          properties: {
            name1: {
              type: 'wildcard',
              fields: {
                text: {
                  type: 'match_only_text',
                },
              },
            },
          },
        };

        setup({ onChange: onChangeHandler, value });

        await screen.findByTestId('mappingsEditor');

        // Verify onChange was called with the value including fields property
        expect(onChangeHandler).toHaveBeenCalled();
        const lastCall = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1][0];
        data = lastCall.getData(lastCall.isValid ?? true);
        expect(data).toEqual(value);
      });
    });
  });

  describe('datatypes', () => {
    describe('other datatype', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      const onChangeHandler = jest.fn();

      test('allow to add custom field type', async () => {
        renderMappingsEditor({ onChange: onChangeHandler, indexSettings: {} });

        await screen.findByTestId('mappingsEditor');

        // Click "Add field" button to show the create field form
        const addFieldButton = screen.getByTestId('addFieldButton');
        fireEvent.click(addFieldButton);

        const createForm = await screen.findByTestId('createFieldForm');

        // Set field name
        const nameInput = within(createForm).getByTestId('nameParameterInput');
        fireEvent.change(nameInput, { target: { value: 'myField' } });

        // Select "other" field type using the lightweight TypeParameter mock
        const fieldTypeSelect = within(createForm).getByTestId('fieldType');
        fireEvent.change(fieldTypeSelect, { target: { value: 'other' } });
        fireEvent.blur(fieldTypeSelect);

        await within(createForm).findByTestId('fieldSubType');

        const customTypeInput = within(createForm).getByTestId('fieldSubType');
        fireEvent.change(customTypeInput, { target: { value: 'customType' } });

        // Click "Add" button to submit the field
        const addButton = within(createForm).getByTestId('addButton');
        fireEvent.click(addButton);

        await waitFor(() => {
          expect(onChangeHandler).toHaveBeenCalled();
        });

        const mappings = {
          properties: {
            myField: {
              type: 'customType',
            },
          },
        };

        const [callData] = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1];
        const actualMappings = callData.getData();
        expect(actualMappings).toEqual(mappings);
      });

      test('allow to change a field type to a custom type', async () => {
        const defaultMappings = {
          properties: {
            myField: {
              type: 'text',
            },
          },
        };

        const updatedMappings = {
          properties: {
            myField: {
              type: 'customType',
            },
          },
        };

        renderMappingsEditor({
          value: defaultMappings,
          onChange: onChangeHandler,
          indexSettings: {},
        });

        await screen.findByTestId('mappingsEditor');

        // Open the flyout to edit the field
        const editButton = screen.getByTestId('editFieldButton');
        fireEvent.click(editButton);

        const flyout = await screen.findByTestId('mappingsEditorFieldEdit');

        // Change the field type to "other" using the lightweight TypeParameter mock
        const fieldTypeSelect = within(flyout).getByTestId('fieldType');
        fireEvent.change(fieldTypeSelect, { target: { value: 'other' } });
        fireEvent.blur(fieldTypeSelect);

        const customTypeInput = await within(flyout).findByTestId('fieldSubType');
        fireEvent.change(customTypeInput, { target: { value: 'customType' } });

        // Save the field and close the flyout
        const updateButton = within(flyout).getByTestId('editFieldUpdateButton');
        fireEvent.click(updateButton);

        await waitFor(() => {
          expect(onChangeHandler).toHaveBeenCalled();
        });

        const [callData] = onChangeHandler.mock.calls[onChangeHandler.mock.calls.length - 1];
        const actualMappings = callData.getData();
        expect(actualMappings).toEqual(updatedMappings);
      });
    });
  });
});
