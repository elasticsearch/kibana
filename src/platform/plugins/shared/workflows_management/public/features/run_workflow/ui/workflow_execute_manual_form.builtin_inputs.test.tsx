/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { monaco as mockMonaco } from '@kbn/code-editor';
import { I18nProvider } from '@kbn/i18n-react';
import { KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX } from '@kbn/workflows';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';
import { WorkflowExecuteManualForm } from './workflow_execute_manual_form';

const BUILTIN_INPUTS: JsonModelSchemaType = {
  properties: {
    notificationGroup: {
      $ref: `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}alertingV2NotificationGroup`,
    },
  },
  required: ['notificationGroup'],
};

jest.mock('@kbn/code-editor', () => ({
  CodeEditor: ({
    value,
    onChange,
    editorDidMount,
    dataTestSubj,
  }: {
    value: string;
    onChange?: (value: string) => void;
    editorDidMount?: (editor: { getModel: () => { uri: { toString: () => string } } }) => void;
    dataTestSubj?: string;
  }) => {
    editorDidMount?.({
      getModel: () => ({ uri: { toString: () => 'inmemory://test/manual-input.json' } }),
    });

    return (
      <textarea
        data-test-subj={dataTestSubj || 'code-editor'}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
      />
    );
  },
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

jest.mock('./input_validation_callout', () => ({
  InputValidationCallout: ({ errors }: { errors: string }) => (
    <div data-test-subj="workflow-input-validation-callout">{errors}</div>
  ),
}));

jest.mock('@kbn/workflows-ui', () => ({
  ...jest.requireActual('@kbn/workflows-ui'),
  WORKFLOWS_MONACO_EDITOR_THEME: 'workflows-theme',
}));

const renderForm = (value: string) => {
  const setValue = jest.fn();
  const setErrors = jest.fn();

  render(
    <WorkflowExecuteManualForm
      value={value}
      inputs={BUILTIN_INPUTS}
      setValue={setValue}
      errors={null}
      setErrors={setErrors}
    />,
    { wrapper: I18nProvider }
  );

  return { setValue, setErrors };
};

describe('WorkflowExecuteManualForm built-in kibana input refs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers Monaco JSON schema with merged kibana.definitions for $ref resolution', async () => {
    renderForm('{}');

    await waitFor(() => {
      expect(mockMonaco.languages.json.jsonDefaults.setDiagnosticsOptions).toHaveBeenCalled();
    });

    const options = (
      mockMonaco.languages.json.jsonDefaults.setDiagnosticsOptions as jest.Mock
    ).mock.calls.at(-1)?.[0];

    expect(options?.schemas?.[0]?.schema).toMatchObject({
      kibana: {
        definitions: {
          alertingV2NotificationGroup: expect.objectContaining({ type: 'object' }),
        },
      },
    });
  });

  it('reports Zod validation errors when required built-in ref payload is incomplete', async () => {
    const { setErrors } = renderForm(
      JSON.stringify(
        {
          notificationGroup: {
            episodes: [],
          },
        },
        null,
        2
      )
    );

    await waitFor(() => {
      expect(setErrors).toHaveBeenCalledWith(expect.stringMatching(/notificationGroup/));
    });
  });

  it('accepts a structurally valid built-in ref payload', async () => {
    const { setErrors } = renderForm(
      JSON.stringify(
        {
          notificationGroup: {
            id: 'group-1',
            policyId: 'policy-1',
            groupKey: {},
            episodes: [
              {
                last_event_timestamp: '2024-01-01T00:00:00Z',
                rule_id: 'rule-1',
                group_hash: 'hash-1',
                episode_id: 'episode-1',
                episode_status: 'active',
              },
            ],
          },
        },
        null,
        2
      )
    );

    await waitFor(() => {
      expect(setErrors).toHaveBeenCalledWith(null);
    });
  });
});
