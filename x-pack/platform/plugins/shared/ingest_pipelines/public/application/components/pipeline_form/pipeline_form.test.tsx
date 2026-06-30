/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@kbn/code-editor-mock/jest_helper';

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';

import type { Processor } from '../../../../common/types';
import { PipelineForm } from './pipeline_form';

const mockUseKibana = jest.fn();

jest.mock('@kbn/unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: jest.fn(),
}));

jest.mock('../../../shared_imports', () => ({
  ...jest.requireActual('../../../shared_imports'),
  useKibana: () => mockUseKibana(),
  JsonEditorField: () => <div data-test-subj="jsonEditorFieldStub" />,
}));

// Avoid mounting the real processors editor (which registers `onUpdate` in an effect)
jest.mock('../pipeline_editor', () => ({
  ProcessorsEditorContextProvider: ({ children }: { children?: React.ReactNode }) => (
    <>{children}</>
  ),
  PipelineEditor: () => <div data-test-subj="pipelineEditorStub" />,
}));

describe('PipelineForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana.mockReturnValue({
      services: {
        overlays: { openConfirm: jest.fn() },
        history: {},
        application: { navigateToUrl: jest.fn() },
        http: {},
        documentation: {
          getFieldAccessPatternUrl: jest.fn(() => 'https://elastic.co/docs'),
        },
      },
    });
  });

  it('can submit using last-known processors state if the editor has not registered yet', async () => {
    const user = userEvent.setup();
    const onSave = jest.fn();

    const processors: Processor[] = [
      {
        set: {
          field: 'foo',
          value: 'bar',
        },
      },
    ];
    const onFailure: Processor[] = [
      {
        set: {
          field: 'err',
          value: 'fallback',
        },
      },
    ];

    render(
      <I18nProvider>
        <PipelineForm
          defaultValue={{
            name: 'my_pipeline',
            description: 'pipeline description',
            processors,
            on_failure: onFailure,
            deprecated: true,
            isManaged: true,
          }}
          onSave={onSave}
          onCancel={() => {}}
          isSaving={false}
          saveError={null}
        />
      </I18nProvider>
    );

    await user.click(screen.getByTestId('submitButton'));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'my_pipeline',
          description: 'pipeline description',
          processors,
          on_failure: onFailure,
        })
      )
    );
  });
});
