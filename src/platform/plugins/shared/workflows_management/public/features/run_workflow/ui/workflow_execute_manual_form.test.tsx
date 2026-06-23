/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { WorkflowExecuteManualForm } from './workflow_execute_manual_form';
import { INPUT_STRING_PLACEHOLDER } from '../../../../common/consts/placeholders';

// Mock CodeEditor
jest.mock('@kbn/code-editor', () => ({
  CodeEditor: (props: any) => (
    <textarea
      data-test-subj={props.dataTestSubj || 'code-editor'}
      value={props.value}
      onChange={(e) => props.onChange?.(e.target.value)}
      readOnly={props.options?.readOnly}
      aria-label={props['aria-label']}
    />
  ),
  monaco: {
    languages: {
      json: {
        jsonDefaults: {
          setDiagnosticsOptions: jest.fn(),
        },
      },
    },
    editor: {},
  },
}));

// Mock input validation callout
jest.mock('./input_validation_callout', () => ({
  InputValidationCallout: ({ errors }: { errors: string }) => (
    <div data-test-subj="workflow-input-validation-callout">{errors}</div>
  ),
}));

// Mock buildFieldsZodValidator
jest.mock('@kbn/workflows/spec/lib/build_fields_zod_validator', () => ({
  buildFieldsZodValidator: jest.fn(() => ({
    safeParse: jest.fn(() => ({ success: true })),
  })),
}));

// Mock theme constant
jest.mock('@kbn/workflows-ui', () => ({
  ...jest.requireActual('@kbn/workflows-ui'),
  WORKFLOWS_MONACO_EDITOR_THEME: 'workflows-theme',
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(component, { wrapper: I18nProvider });
};

describe('WorkflowExecuteManualForm', () => {
  let mockSetValue: jest.Mock;
  let mockSetErrors: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSetValue = jest.fn();
    mockSetErrors = jest.fn();
  });

  it('should render the form with Input Data label', () => {
    renderWithProviders(
      <WorkflowExecuteManualForm
        value="{}"
        setValue={mockSetValue}
        errors={null}
        setErrors={mockSetErrors}
      />
    );

    expect(screen.getByText('Input Data')).toBeInTheDocument();
  });

  it('should display the validation callout when errors are present', () => {
    renderWithProviders(
      <WorkflowExecuteManualForm
        value='{"key": "value"}'
        setValue={mockSetValue}
        errors="name: Required"
        setErrors={mockSetErrors}
      />
    );

    expect(screen.getByTestId('workflow-input-validation-callout')).toBeInTheDocument();
    expect(screen.getByText('name: Required')).toBeInTheDocument();
  });

  it('should not display the validation callout when there are no errors', () => {
    renderWithProviders(
      <WorkflowExecuteManualForm
        value='{"key": "value"}'
        setValue={mockSetValue}
        errors={null}
        setErrors={mockSetErrors}
      />
    );

    expect(screen.queryByTestId('workflow-input-validation-callout')).not.toBeInTheDocument();
  });

  it('should call setValue with default inputs on mount', () => {
    renderWithProviders(
      <WorkflowExecuteManualForm
        value=""
        setValue={mockSetValue}
        errors={null}
        setErrors={mockSetErrors}
      />
    );

    // The useEffect should call setValue with the default workflow input
    expect(mockSetValue).toHaveBeenCalledWith(expect.any(String));
  });

  describe('initial input pre-fill', () => {
    const getInitialJson = (inputs?: JsonModelSchemaType): Record<string, unknown> => {
      const setValue = jest.fn();
      renderWithProviders(
        <WorkflowExecuteManualForm
          value=""
          inputs={inputs}
          setValue={setValue}
          errors={null}
          setErrors={jest.fn()}
        />
      );
      expect(setValue).toHaveBeenCalled();
      const raw = setValue.mock.calls[0][0] as string;
      return JSON.parse(raw);
    };

    it('emits an empty object when no inputs schema is provided', () => {
      expect(getInitialJson()).toEqual({});
    });

    it('emits an empty object when the schema has no properties', () => {
      expect(getInitialJson({ properties: {} })).toEqual({});
    });

    it('includes required properties without a default as placeholders', () => {
      expect(
        getInitialJson({
          properties: { streamName: { type: 'string' } },
          required: ['streamName'],
        })
      ).toEqual({ streamName: INPUT_STRING_PLACEHOLDER });
    });

    it('uses schema defaults for required properties', () => {
      expect(
        getInitialJson({
          properties: { maxIterations: { type: 'number', default: 5 } },
          required: ['maxIterations'],
        })
      ).toEqual({ maxIterations: 5 });
    });

    it('uses schema defaults for optional properties', () => {
      expect(
        getInitialJson({
          properties: { color: { type: 'string', default: 'blue' } },
        })
      ).toEqual({ color: 'blue' });
    });

    it('omits optional properties that have no default', () => {
      expect(
        getInitialJson({
          properties: {
            startsAt: { type: 'string', description: 'Defaults to 24h ago at runtime' },
            enabled: { type: 'boolean' },
            tags: { type: 'array', items: { type: 'string' } },
          },
        })
      ).toEqual({});
    });

    it('emits only required placeholders and defaults in a mixed schema', () => {
      // Mirrors the example from issue elastic/security-team#16857: only `streamName` is
      // required and only `maxIterations` has a default; optional `startsAt` should not appear.
      expect(
        getInitialJson({
          properties: {
            streamName: { type: 'string' },
            maxIterations: { type: 'number', default: 5 },
            startsAt: { type: 'string', description: 'Defaults to 24h ago at runtime' },
          },
          required: ['streamName'],
        })
      ).toEqual({
        streamName: INPUT_STRING_PLACEHOLDER,
        maxIterations: 5,
      });
    });

    it('resolves $ref nested defaults and omits optional array/boolean/integer without defaults', () => {
      // Catches regressions in applyInputDefaults $ref resolution; optional top-level fields
      // with no default must not appear (see PR #264633 / security-team#16857).
      expect(
        getInitialJson({
          properties: {
            streamName: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            dryRun: { type: 'boolean' },
            priority: { type: 'integer' },
            owner: { $ref: '#/definitions/UserSchema' },
          },
          required: ['streamName'],
          definitions: {
            UserSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', default: 'Jane Doe' },
                team: { type: 'string' },
              },
              required: ['name'],
            },
          },
        } as JsonModelSchemaType)
      ).toEqual({
        streamName: INPUT_STRING_PLACEHOLDER,
        owner: { name: 'Jane Doe' },
      });
    });

    it('prefills optional built-in #/kibana/definitions $ref with structural defaults from applyInputDefaults', () => {
      expect(
        getInitialJson({
          properties: {
            notificationGroup: { $ref: '#/kibana/definitions/alertingV2NotificationGroup' },
          },
        } as JsonModelSchemaType)
      ).toEqual({
        notificationGroup: {
          episodes: [],
        },
      });
    });

    it('prefills required unknown built-in $ref with an empty object so the field is editable', () => {
      expect(
        getInitialJson({
          properties: {
            payload: { $ref: '#/kibana/definitions/DoesNotExist' },
          },
          required: ['payload'],
        } as JsonModelSchemaType)
      ).toEqual({ payload: {} });
    });

    it('prefills required built-in #/kibana/definitions $ref using generated samples', () => {
      const initial = getInitialJson({
        properties: {
          notificationGroup: { $ref: '#/kibana/definitions/alertingV2NotificationGroup' },
        },
        required: ['notificationGroup'],
      } as JsonModelSchemaType);
      expect(initial.notificationGroup).toMatchObject({
        id: INPUT_STRING_PLACEHOLDER,
        policyId: INPUT_STRING_PLACEHOLDER,
        groupKey: {},
        episodes: [
          {
            last_event_timestamp: INPUT_STRING_PLACEHOLDER,
            rule_id: INPUT_STRING_PLACEHOLDER,
            group_hash: INPUT_STRING_PLACEHOLDER,
            episode_id: INPUT_STRING_PLACEHOLDER,
            episode_status: INPUT_STRING_PLACEHOLDER,
          },
        ],
      });
    });
  });
});
