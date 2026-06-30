/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { fireEvent, render, screen } from '@testing-library/react';
import type { JSONSchema7 } from 'json-schema';
import React from 'react';
import { I18nProvider } from '@kbn/i18n-react';
import type { StepContext } from '@kbn/workflows';
import { convertJsonSchemaToZod } from '@kbn/workflows/spec/lib/build_fields_zod_validator';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { z } from '@kbn/zod/v4';
import type { ResumeExecutionModalProps } from './resume_execution_modal';
import { ResumeExecutionModal } from './resume_execution_modal';

jest.mock('../../hooks/use_workflows_monaco_theme', () => ({
  useWorkflowsMonacoTheme: jest.fn(),
  WORKFLOWS_MONACO_EDITOR_THEME: 'test-theme',
}));

jest.mock('@kbn/code-editor', () => ({
  CodeEditor: ({ value, onChange, dataTestSubj }: any) => (
    <div data-test-subj={dataTestSubj}>
      <span data-test-subj="editorValue">{value}</span>
      <button
        data-test-subj="editorChangeValid"
        onClick={() => onChange('{"approved":true}')}
        type="button"
      >
        {'valid change'}
      </button>
      <button
        data-test-subj="editorChangeInvalid"
        onClick={() => onChange('{bad json')}
        type="button"
      >
        {'invalid change'}
      </button>
      <button
        data-test-subj="editorChangeSyntaxOkSchemaFail"
        onClick={() => onChange('{"wrongKey": true}')}
        type="button"
      >
        {'valid json invalid schema'}
      </button>
    </div>
  ),
  monaco: {
    languages: { json: { jsonDefaults: { setDiagnosticsOptions: jest.fn() } } },
    editor: {},
  },
}));

const renderWithProviders = (props: ResumeExecutionModalProps) => {
  return render(<ResumeExecutionModal {...props} />, { wrapper: I18nProvider });
};

describe('ResumeExecutionModal', () => {
  const defaultProps: ResumeExecutionModalProps = {
    onClose: jest.fn(),
    onSubmit: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render the modal with "Provide action" title', () => {
      renderWithProviders(defaultProps);
      expect(screen.getByTestId('workflowResumeExecutionModal')).toBeInTheDocument();
      expect(screen.getByText('Provide action')).toBeInTheDocument();
    });

    it('should render the Resume button', () => {
      renderWithProviders(defaultProps);
      expect(screen.getByTestId('workflowSubmitResume')).toBeInTheDocument();
      expect(screen.getByText('Resume')).toBeInTheDocument();
    });

    it('should show default description when no resumeMessage is provided', () => {
      renderWithProviders(defaultProps);
      expect(screen.getByText('Provide input to resume the workflow.')).toBeInTheDocument();
    });

    it('should show custom resumeMessage when provided', () => {
      renderWithProviders({ ...defaultProps, resumeMessage: 'Please approve the deployment' });
      expect(screen.getByText('Please approve the deployment')).toBeInTheDocument();
    });

    it('should render the JSON editor', () => {
      renderWithProviders(defaultProps);
      expect(screen.getByTestId('workflow-resume-json-editor')).toBeInTheDocument();
    });

    it('should initialize with empty object', () => {
      renderWithProviders(defaultProps);
      expect(screen.getByTestId('editorValue')).toHaveTextContent('{}');
    });

    it('should initialize with serialised stepContext when provided', () => {
      const schema = z.object({ approved: z.boolean() });
      renderWithProviders({
        ...defaultProps,
        initialcontextOverride: {
          schema,
          stepContext: { approved: true } as Partial<StepContext>,
        },
      });
      // toHaveTextContent normalises whitespace, so check for the key content
      expect(screen.getByTestId('editorValue')).toHaveTextContent('"approved": true');
    });

    it('should fall back to empty object when initialcontextOverride has undefined stepContext', () => {
      const schema = z.object({ approved: z.boolean() });
      renderWithProviders({
        ...defaultProps,
        initialcontextOverride: {
          schema,
          stepContext: undefined as unknown as Partial<StepContext>,
        },
      });
      // undefined stepContext must not produce "null" or cause the editor to be empty —
      // it must fall back to '{}'.
      expect(screen.getByTestId('editorValue')).toHaveTextContent('{}');
    });
  });

  describe('submit behavior', () => {
    it('should call onSubmit with parsed JSON when Resume is clicked', () => {
      renderWithProviders(defaultProps);
      fireEvent.click(screen.getByTestId('editorChangeValid'));
      fireEvent.click(screen.getByTestId('workflowSubmitResume'));
      expect(defaultProps.onSubmit).toHaveBeenCalledWith({
        stepInputs: { approved: true },
      });
    });

    it('should disable Resume button when JSON is invalid', () => {
      renderWithProviders(defaultProps);
      fireEvent.click(screen.getByTestId('editorChangeInvalid'));
      expect(screen.getByTestId('workflowSubmitResume')).toBeDisabled();
    });

    it('should re-enable Resume button when JSON becomes valid again', () => {
      renderWithProviders(defaultProps);
      fireEvent.click(screen.getByTestId('editorChangeInvalid'));
      expect(screen.getByTestId('workflowSubmitResume')).toBeDisabled();

      fireEvent.click(screen.getByTestId('editorChangeValid'));
      expect(screen.getByTestId('workflowSubmitResume')).not.toBeDisabled();
    });

    it('should disable Resume when JSON parses but fails the resume Zod schema', () => {
      const schema = z.object({ approved: z.boolean() });
      renderWithProviders({
        ...defaultProps,
        initialcontextOverride: {
          schema,
          stepContext: { approved: true } as Partial<StepContext>,
        },
      });
      fireEvent.click(screen.getByTestId('editorChangeSyntaxOkSchemaFail'));
      expect(screen.getByTestId('workflowSubmitResume')).toBeDisabled();
    });

    it('should disable Resume when a JSON Schema required key is missing even if Zod applies defaults', () => {
      const rawJsonSchema = {
        type: 'object',
        properties: {
          approved: { type: 'boolean', default: false },
          optionalMessage: { type: 'string', default: 'whats up' },
        },
        required: ['approved'],
      } satisfies JSONSchema7;
      const schema = convertJsonSchemaToZod(rawJsonSchema);
      renderWithProviders({
        ...defaultProps,
        initialcontextOverride: {
          schema,
          rawJsonSchema: rawJsonSchema as JsonModelSchemaType,
          stepContext: {} as Partial<StepContext>,
        },
      });
      expect(screen.getByTestId('workflowSubmitResume')).toBeDisabled();
    });
  });

  describe('onClose', () => {
    it('should call onClose when modal close is triggered', () => {
      renderWithProviders(defaultProps);
      const closeButton = screen.getByLabelText('Closes this modal window');
      fireEvent.click(closeButton);
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });
});
