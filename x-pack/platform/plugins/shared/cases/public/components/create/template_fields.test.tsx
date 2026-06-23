/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { stringify as yamlStringify } from 'yaml';

import { CreateCaseTemplateFields } from './template_fields';
import { renderWithTestingProviders } from '../../common/mock';
import { CASE_EXTENDED_FIELDS } from '../../../common/constants';

const mockUseFormData = jest.fn();
const mockUseFormContext = jest.fn();
jest.mock('@kbn/es-ui-shared-plugin/static/forms/hook_form_lib', () => ({
  ...jest.requireActual('@kbn/es-ui-shared-plugin/static/forms/hook_form_lib'),
  useFormData: (...args: unknown[]) => mockUseFormData(...args),
  useFormContext: () => mockUseFormContext(),
  UseField: () => null,
}));

const mockUseTemplateFormSync = jest.fn();
jest.mock('./use_template_form_sync', () => ({
  useTemplateFormSync: (...args: unknown[]) => mockUseTemplateFormSync(...args),
}));

const mockUseGetFieldDefinitions = jest.fn();
jest.mock('../field_library/hooks/use_get_field_definitions', () => ({
  useGetFieldDefinitions: (...args: unknown[]) => mockUseGetFieldDefinitions(...args),
}));

jest.mock('../templates_v2/field_types/field_types_registry', () => ({
  controlRegistry: {
    INPUT_TEXT: ({ name, label }: { name: string; label?: string }) => (
      <div data-test-subj={`control-${name}`}>{label ?? name}</div>
    ),
    INPUT_NUMBER: ({ name, label }: { name: string; label?: string }) => (
      <div data-test-subj={`control-${name}`}>{label ?? name}</div>
    ),
  },
}));

const mockUseResolvedFields = jest.fn();
jest.mock('../field_library/hooks/use_resolved_fields', () => ({
  useResolvedFields: (...args: unknown[]) => mockUseResolvedFields(...args),
}));

describe('CreateCaseTemplateFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseFormContext.mockReturnValue({ setFieldValue: jest.fn() });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [] },
      isLoading: false,
    });
    mockUseResolvedFields.mockImplementation((fields: unknown[]) => ({
      resolvedFields: fields,
      isLoading: false,
    }));
  });

  it('renders nothing when no template is selected and no global fields', () => {
    mockUseFormData.mockReturnValue([{ templateId: '' }]);
    mockUseTemplateFormSync.mockReturnValue({ template: undefined, isLoading: false });

    const { container } = renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(container.textContent).toBe('');
    expect(screen.queryByText('Template not selected')).not.toBeInTheDocument();
  });

  it('renders nothing when template has empty fields array and no global fields', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: { name: 'Empty', fields: [] },
      },
      isLoading: false,
    });

    const { container } = renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(container.textContent).toBe('');
    expect(screen.queryByText('Extended fields')).not.toBeInTheDocument();
  });

  it('renders nothing when template definition has no fields property and no global fields', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: { name: 'No Fields' },
      },
      isLoading: false,
    });

    const { container } = renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(container.textContent).toBe('');
    expect(screen.queryByText('Template not selected')).not.toBeInTheDocument();
  });

  it('returns null when loading', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({ template: undefined, isLoading: true });

    const { container } = renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(container.textContent).toBe('');
  });

  it('renders template fields when template is loaded with fields', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: {
          name: 'Test Template',
          fields: [
            { name: 'hostname', control: 'INPUT_TEXT', type: 'keyword', label: 'Host Name' },
            { name: 'effort', control: 'INPUT_NUMBER', type: 'integer', label: 'Effort Level' },
          ],
        },
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.getByTestId('control-hostname')).toHaveTextContent('Host Name');
    expect(screen.getByTestId('control-effort')).toHaveTextContent('Effort Level');
  });

  it('skips fields with unregistered control types', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: {
          name: 'Test Template',
          fields: [
            { name: 'known', control: 'INPUT_TEXT', type: 'keyword', label: 'Known' },
            { name: 'unknown', control: 'UNKNOWN_TYPE', type: 'keyword', label: 'Unknown' },
          ],
        },
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(screen.getByTestId('control-known')).toBeInTheDocument();
    expect(screen.queryByTestId('control-unknown')).not.toBeInTheDocument();
  });

  it('renders nothing when templateId is undefined and no global fields', () => {
    mockUseFormData.mockReturnValue([{ templateId: undefined }]);
    mockUseTemplateFormSync.mockReturnValue({ template: undefined, isLoading: false });

    const { container } = renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(container.textContent).toBe('');
    expect(screen.queryByText('Template not selected')).not.toBeInTheDocument();
  });

  it('renders global fields when no template is selected but isGlobal defs exist', () => {
    mockUseFormData.mockReturnValue([{ templateId: undefined }]);
    mockUseTemplateFormSync.mockReturnValue({ template: undefined, isLoading: false });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: {
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-1',
            name: 'incident_type',
            definition: yamlStringify({
              name: 'incident_type',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Incident Type',
            }),
            owner: 'securitySolution',
            isGlobal: true,
          },
        ],
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.getByTestId('control-incident_type')).toBeInTheDocument();
    expect(screen.queryByText('Template not selected')).not.toBeInTheDocument();
  });

  it('renders global fields when no template is selected even if useResolvedFields reports isLoading (react-query v4 disabled-query regression)', () => {
    // FAILURE SCENARIO: react-query v4 keeps disabled queries in isLoading:true state indefinitely.
    // When no template is selected, useResolvedFields calls useGetFieldDefinitions({owner: undefined}),
    // which is disabled and therefore stuck in isLoading:true. Without the fix, the loading guard
    // would swallow the component output and global fields would never appear.
    mockUseFormData.mockReturnValue([{ templateId: undefined }]);
    mockUseTemplateFormSync.mockReturnValue({ template: undefined, isLoading: false });
    mockUseResolvedFields.mockReturnValue({ resolvedFields: [], isLoading: true });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: {
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-1',
            name: 'incident_type',
            definition: yamlStringify({
              name: 'incident_type',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Incident Type',
            }),
            owner: 'securitySolution',
            isGlobal: true,
          },
        ],
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.getByTestId('control-incident_type')).toBeInTheDocument();
  });

  it('hides a global field from the global section when the template references it via $ref', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: {
          name: 'Test Template',
          fields: [
            { $ref: 'incident_type' },
            { name: 'hostname', control: 'INPUT_TEXT', type: 'keyword', label: 'Host Name' },
          ],
        },
      },
      isLoading: false,
    });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: {
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-1',
            name: 'incident_type',
            definition: yamlStringify({
              name: 'incident_type',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Incident Type',
            }),
            owner: 'securitySolution',
            isGlobal: true,
          },
        ],
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    // The template references incident_type via $ref — it should not appear in the global section.
    // The "Extended fields" heading still appears because the template has its own fields (hostname).
    expect(screen.queryByText('Global fields')).not.toBeInTheDocument();
    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.queryByTestId('control-incident_type')).not.toBeInTheDocument();
  });

  it('shows a global field when it is NOT referenced by the template', () => {
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: {
          name: 'Test Template',
          fields: [
            { name: 'hostname', control: 'INPUT_TEXT', type: 'keyword', label: 'Host Name' },
          ],
        },
      },
      isLoading: false,
    });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: {
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-1',
            name: 'incident_type',
            definition: yamlStringify({
              name: 'incident_type',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Incident Type',
            }),
            owner: 'securitySolution',
            isGlobal: true,
          },
        ],
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.getByTestId('control-incident_type')).toBeInTheDocument();
  });

  it('applies global field defaults to the form when definitions load', async () => {
    const setFieldValue = jest.fn();
    mockUseFormContext.mockReturnValue({ setFieldValue });
    mockUseFormData.mockReturnValue([{ templateId: undefined }]);
    mockUseTemplateFormSync.mockReturnValue({ template: undefined, isLoading: false });
    mockUseGetFieldDefinitions.mockReturnValue({
      data: {
        fieldDefinitions: [
          {
            fieldDefinitionId: 'fd-1',
            name: 'incident_type',
            definition: yamlStringify({
              name: 'incident_type',
              type: 'keyword',
              control: 'INPUT_TEXT',
              label: 'Incident Type',
              metadata: { default: 'critical' },
            }),
            owner: 'securitySolution',
            isGlobal: true,
          },
        ],
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    // The default value is applied via innerForm.reset(), which triggers the watch
    // subscription that syncs to the parent form via setFieldValue.
    await waitFor(() => {
      expect(setFieldValue).toHaveBeenCalledWith(
        CASE_EXTENDED_FIELDS,
        expect.objectContaining({ incident_type_as_keyword: 'critical' })
      );
    });
  });

  it('syncs inner form changes to parent form under the CASE_EXTENDED_FIELDS key', () => {
    const setFieldValue = jest.fn();
    mockUseFormContext.mockReturnValue({ setFieldValue });
    mockUseFormData.mockReturnValue([{ templateId: 'template-1' }]);
    mockUseTemplateFormSync.mockReturnValue({
      template: {
        templateId: 'template-1',
        definition: { name: 'Test', fields: [] },
      },
      isLoading: false,
    });

    renderWithTestingProviders(<CreateCaseTemplateFields />);

    const allCallsWithWrongKey = setFieldValue.mock.calls.filter(
      ([key]) => key === 'extendedFields'
    );
    expect(allCallsWithWrongKey).toHaveLength(0);

    const extendedFieldCalls = setFieldValue.mock.calls.filter(
      ([key]) => key === CASE_EXTENDED_FIELDS
    );
    extendedFieldCalls.forEach(([key]) => {
      expect(key).toBe(CASE_EXTENDED_FIELDS);
    });
  });
});
