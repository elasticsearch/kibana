/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';

import type { CaseUI } from '../../../../common';
import { stringify as yamlStringify } from 'yaml';
import { GlobalCaseFields } from './global_case_fields';

const mockUseGetTemplate = jest.fn();
jest.mock('../../templates_v2/hooks/use_get_template', () => ({
  useGetTemplate: (...args: unknown[]) => mockUseGetTemplate(...args),
}));

const mockUseGetFieldDefinitions = jest.fn();
jest.mock('../../field_library/hooks/use_get_field_definitions', () => ({
  useGetFieldDefinitions: (...args: unknown[]) => mockUseGetFieldDefinitions(...args),
}));

jest.mock('../../field_library/hooks/use_resolved_fields', () => ({
  useResolvedFields: (fields: unknown[]) => ({
    resolvedFields: fields,
    isLoading: false,
  }),
}));

describe('GlobalCaseFields', () => {
  const caseData = {
    owner: 'securitySolution',
    extendedFields: { incidentTypeAsKeyword: 'outage' },
  } as unknown as CaseUI;

  const makeGlobalDef = (name: string) => ({
    fieldDefinitionId: `fd-${name}`,
    name,
    definition: yamlStringify({ name, type: 'keyword', control: 'INPUT_TEXT', label: name }),
    owner: 'securitySolution',
    isGlobal: true,
    description: '',
  });

  const globalOnUpdateField = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no active template, not loading
    mockUseGetTemplate.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('renders a skeleton while field definitions are loading', () => {
    mockUseGetFieldDefinitions.mockReturnValue({ data: undefined, isLoading: true });
    render(<GlobalCaseFields caseData={caseData} onUpdateField={globalOnUpdateField} />);
    expect(screen.getByTestId('global-case-fields-loading')).toBeInTheDocument();
  });

  it('renders nothing when the field definitions query errors', () => {
    mockUseGetFieldDefinitions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });
    const { container } = render(
      <GlobalCaseFields caseData={caseData} onUpdateField={globalOnUpdateField} />
    );
    expect(container.textContent).toBe('');
  });

  it('renders nothing when there are no isGlobal definitions', () => {
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [] },
      isLoading: false,
    });
    const { container } = render(
      <GlobalCaseFields caseData={caseData} onUpdateField={globalOnUpdateField} />
    );
    expect(container.textContent).toBe('');
  });

  it('renders global fields form when isGlobal definitions exist', () => {
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [makeGlobalDef('incident_type')] },
      isLoading: false,
    });
    render(<GlobalCaseFields caseData={caseData} onUpdateField={globalOnUpdateField} />);
    expect(screen.queryByText('Global fields')).not.toBeInTheDocument();
    expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
  });

  it('renders the "Extended fields" heading when there is no active template', () => {
    const caseWithoutTemplate = { ...caseData, template: undefined } as unknown as CaseUI;
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [makeGlobalDef('incident_type')] },
      isLoading: false,
    });
    mockUseGetTemplate.mockReturnValue({ data: undefined, isLoading: false });
    render(<GlobalCaseFields caseData={caseWithoutTemplate} onUpdateField={globalOnUpdateField} />);
    expect(screen.getByText('Extended fields')).toBeInTheDocument();
    expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
  });

  it('does not render the "Extended fields" heading when a template is active', () => {
    const caseWithTemplate = {
      ...caseData,
      template: { id: 'template-1', version: 1 },
    } as unknown as CaseUI;
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [makeGlobalDef('incident_type')] },
      isLoading: false,
    });
    mockUseGetTemplate.mockReturnValue({
      data: {
        templateId: 'template-1',
        definition: { name: 'Test', fields: [] },
      },
      isLoading: false,
    });
    render(<GlobalCaseFields caseData={caseWithTemplate} onUpdateField={globalOnUpdateField} />);
    expect(screen.queryByText('Extended fields')).not.toBeInTheDocument();
    expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
  });

  it('skips malformed definitions without crashing', () => {
    mockUseGetFieldDefinitions.mockReturnValue({
      data: {
        fieldDefinitions: [
          { ...makeGlobalDef('bad'), definition: 'not: valid: [broken' },
          makeGlobalDef('good_field'),
        ],
      },
      isLoading: false,
    });
    render(<GlobalCaseFields caseData={caseData} onUpdateField={globalOnUpdateField} />);
    expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
  });

  it('queries field definitions with isGlobal: true and the case owner', () => {
    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [] },
      isLoading: false,
    });
    render(<GlobalCaseFields caseData={caseData} onUpdateField={globalOnUpdateField} />);
    expect(mockUseGetFieldDefinitions).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'securitySolution', isGlobal: true })
    );
  });

  describe('when a template is active', () => {
    const caseWithTemplate = {
      ...caseData,
      template: { id: 'template-1', version: 1 },
    } as unknown as CaseUI;

    it('hides a global field that is already referenced via $ref in the template', () => {
      mockUseGetFieldDefinitions.mockReturnValue({
        data: {
          fieldDefinitions: [makeGlobalDef('incident_type'), makeGlobalDef('environment')],
        },
        isLoading: false,
        isError: false,
      });
      mockUseGetTemplate.mockReturnValue({
        data: {
          templateId: 'template-1',
          definition: {
            name: 'Test',
            fields: [{ $ref: 'incident_type' }],
          },
        },
        isLoading: false,
      });

      render(<GlobalCaseFields caseData={caseWithTemplate} onUpdateField={globalOnUpdateField} />);

      expect(screen.queryByTestId('template-field-incident_type')).not.toBeInTheDocument();
      expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
    });

    it('shows a global field that is NOT referenced by the template', () => {
      mockUseGetFieldDefinitions.mockReturnValue({
        data: {
          fieldDefinitions: [makeGlobalDef('incident_type'), makeGlobalDef('environment')],
        },
        isLoading: false,
        isError: false,
      });
      mockUseGetTemplate.mockReturnValue({
        data: {
          templateId: 'template-1',
          definition: {
            name: 'Test',
            fields: [{ $ref: 'incident_type' }],
          },
        },
        isLoading: false,
      });

      render(<GlobalCaseFields caseData={caseWithTemplate} onUpdateField={globalOnUpdateField} />);

      expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
    });

    it('renders nothing when all global fields are referenced by the template', () => {
      mockUseGetFieldDefinitions.mockReturnValue({
        data: { fieldDefinitions: [makeGlobalDef('incident_type')] },
        isLoading: false,
        isError: false,
      });
      mockUseGetTemplate.mockReturnValue({
        data: {
          templateId: 'template-1',
          definition: {
            name: 'Test',
            fields: [{ $ref: 'incident_type' }],
          },
        },
        isLoading: false,
      });

      const { container } = render(
        <GlobalCaseFields caseData={caseWithTemplate} onUpdateField={globalOnUpdateField} />
      );
      expect(container.textContent).toBe('');
    });

    it('renders a skeleton while the template is loading (prevents field flash)', () => {
      mockUseGetFieldDefinitions.mockReturnValue({
        data: { fieldDefinitions: [makeGlobalDef('incident_type')] },
        isLoading: false,
        isError: false,
      });
      mockUseGetTemplate.mockReturnValue({ data: undefined, isLoading: true });

      render(<GlobalCaseFields caseData={caseWithTemplate} onUpdateField={globalOnUpdateField} />);
      expect(screen.getByTestId('global-case-fields-loading')).toBeInTheDocument();
    });
  });

  it('shows all global fields when there is no active template', () => {
    const caseWithoutTemplate = {
      ...caseData,
      template: undefined,
    } as unknown as CaseUI;

    mockUseGetFieldDefinitions.mockReturnValue({
      data: { fieldDefinitions: [makeGlobalDef('incident_type'), makeGlobalDef('environment')] },
      isLoading: false,
      isError: false,
    });
    mockUseGetTemplate.mockReturnValue({ data: undefined, isLoading: false });

    render(<GlobalCaseFields caseData={caseWithoutTemplate} onUpdateField={globalOnUpdateField} />);

    expect(screen.getByTestId('template-fields-form')).toBeInTheDocument();
  });
});
