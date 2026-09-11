/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EvaluatorEditorFlyout } from './evaluator_editor_flyout';
import {
  useCreateEvaluator,
  useEvaluator,
  useResolveInstrumentation,
  useTestEvaluator,
  useUpdateEvaluator,
} from '../../hooks/use_evaluators_api';
import { useModelConnectors } from '../../hooks/use_model_connectors';

jest.mock('../../hooks/use_evaluators_api');
jest.mock('../../hooks/use_model_connectors');
// EuiComboBox cannot be driven by fireEvent.change, so stand in a native select.
jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');
  const MockEuiComboBox = ({
    options = [],
    selectedOptions = [],
    onChange,
    'data-test-subj': dataTestSubj,
  }: {
    options?: Array<{ label: string; value?: string }>;
    selectedOptions?: Array<{ label: string; value?: string }>;
    onChange: (next: Array<{ label: string; value?: string }>) => void;
    'data-test-subj'?: string;
  }) => (
    <select
      data-test-subj={dataTestSubj}
      value={selectedOptions[0]?.value ?? ''}
      onChange={(event) => {
        const match = options.find((option) => option.value === event.target.value);
        onChange(match ? [match] : []);
      }}
    >
      <option value="">--</option>
      {options.map((option) => (
        <option key={option.value ?? option.label} value={option.value ?? option.label}>
          {option.label}
        </option>
      ))}
    </select>
  );

  return { ...actual, EuiComboBox: MockEuiComboBox };
});

const mockAddSuccess = jest.fn();
jest.mock('@kbn/kibana-react-plugin/public', () => ({
  ...jest.requireActual('@kbn/kibana-react-plugin/public'),
  useKibana: () => ({ services: { notifications: { toasts: { addSuccess: mockAddSuccess } } } }),
}));

const mockedUseEvaluator = jest.mocked(useEvaluator);
const mockedUseCreate = jest.mocked(useCreateEvaluator);
const mockedUseUpdate = jest.mocked(useUpdateEvaluator);
const mockedUseTest = jest.mocked(useTestEvaluator);
const mockedUseResolve = jest.mocked(useResolveInstrumentation);
const mockedUseConnectors = jest.mocked(useModelConnectors);

const JUDGE = {
  system_prompt: 'You judge tone.',
  prompt: 'Rate {{{agent_response}}}.',
  evidence: ['response'],
  reference_data_keys: [],
  output: { scores: [{ name: 'tone', type: 'number' }] },
};

const TRACE_ID = '0af7651916cd43dd8448eb211c8031ab';

const setField = (testSubj: string, value: string) => {
  fireEvent.change(screen.getByTestId(testSubj), { target: { value } });
};

const fillValidDraft = () => {
  setField('evalsEvaluatorName', 'tone-judge');
  setField('evalsEvaluatorDescription', 'Rates tone');
  setField('evalsEvaluatorSystemPrompt', 'You judge tone.');
  setField('evalsEvaluatorPrompt', 'Rate {{{agent_response}}}.');
  setField('evalsEvaluatorScoreName-0', 'tone');
};

const save = () => fireEvent.click(screen.getByTestId('evalsEvaluatorSave'));

describe('EvaluatorEditorFlyout', () => {
  const createMutateAsync = jest.fn();
  const updateMutateAsync = jest.fn();
  const testMutateAsync = jest.fn();
  const resolveMutateAsync = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    createMutateAsync.mockResolvedValue({ evaluator: { name: 'tone-judge', version: '1.0.0' } });
    updateMutateAsync.mockResolvedValue({ evaluator: { name: 'tone-judge', version: '1.1.0' } });
    resolveMutateAsync.mockResolvedValue({
      recommended_instrumentation: { profile: 'elastic-inference' },
      profiles: [],
    });
    testMutateAsync.mockResolvedValue({
      result: {
        status: 'ok',
        evaluator: { name: 'tone-judge', kind: 'llm' },
        scores: [{ name: 'tone', score: 0.8, explanation: 'Polite and direct.' }],
      },
    });

    mockedUseEvaluator.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useEvaluator>);
    mockedUseCreate.mockReturnValue({
      mutateAsync: createMutateAsync,
      isLoading: false,
    } as unknown as ReturnType<typeof useCreateEvaluator>);
    mockedUseUpdate.mockReturnValue({
      mutateAsync: updateMutateAsync,
      isLoading: false,
    } as unknown as ReturnType<typeof useUpdateEvaluator>);
    mockedUseTest.mockReturnValue({
      mutateAsync: testMutateAsync,
      isLoading: false,
    } as unknown as ReturnType<typeof useTestEvaluator>);
    mockedUseResolve.mockReturnValue({
      mutateAsync: resolveMutateAsync,
      isLoading: false,
    } as unknown as ReturnType<typeof useResolveInstrumentation>);
    mockedUseConnectors.mockReturnValue({
      connectors: [{ id: 'connector-1', name: 'Judge Connector' }],
      isLoading: false,
      error: undefined,
    });
  });

  const renderCreate = () => render(<EvaluatorEditorFlyout mode="create" onClose={onClose} />);

  describe('validation', () => {
    it.each([
      ['evalsEvaluatorName', 'Not Valid', /^Enter at least 2 characters/i],
      ['evalsEvaluatorDescription', '', /description of up to 2048/i],
      ['evalsEvaluatorPrompt', '', /evaluation prompt of up to 32768/i],
      ['evalsEvaluatorSystemPrompt', '', /system prompt of up to 32768/i],
      ['evalsEvaluatorScoreName-0', '', /Name every score/i],
    ])('reports %s on the field that caused it', async (testSubj, value, message) => {
      renderCreate();
      fillValidDraft();
      setField(testSubj, value);

      save();

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByText('Fix the highlighted fields and try again.')).toBeInTheDocument();
      expect(createMutateAsync).not.toHaveBeenCalled();
    });

    it('requires at least one evidence field', async () => {
      renderCreate();
      fillValidDraft();
      fireEvent.click(screen.getByLabelText('Response'));

      save();

      expect(
        await screen.findByText('Select at least one trace evidence field.')
      ).toBeInTheDocument();
      expect(createMutateAsync).not.toHaveBeenCalled();
    });

    it('rejects categorical labels that omit a score', async () => {
      renderCreate();
      fillValidDraft();
      setField('evalsEvaluatorScoreType-0', 'categorical');
      setField('evalsEvaluatorScoreLabels-0', 'good=');

      save();

      // Shown twice on purpose: once as the form summary, once against the scores group.
      expect(
        await screen.findAllByText(
          'Categorical labels must use label=score with a score from 0 to 1.'
        )
      ).toHaveLength(2);
      expect(createMutateAsync).not.toHaveBeenCalled();
    });

    it('accepts well-formed categorical labels', async () => {
      renderCreate();
      fillValidDraft();
      setField('evalsEvaluatorScoreType-0', 'categorical');
      setField('evalsEvaluatorScoreLabels-0', 'polite=1\nrude=0');

      save();

      await waitFor(() => expect(createMutateAsync).toHaveBeenCalled());
      expect(createMutateAsync.mock.calls[0][0].judge.output.scores[0].labels).toEqual([
        { value: 'polite', score: 1 },
        { value: 'rude', score: 0 },
      ]);
    });
  });

  describe('creating', () => {
    it('submits the draft, announces it and closes', async () => {
      renderCreate();
      fillValidDraft();

      save();

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'tone-judge', description: 'Rates tone' })
      );
      expect(mockAddSuccess).toHaveBeenCalledWith('Created evaluator tone-judge');
    });

    it('keeps the flyout open and explains a server rejection', async () => {
      createMutateAsync.mockRejectedValueOnce(
        new Error('"groundedness" is a built-in evaluator and cannot be redefined')
      );
      renderCreate();
      fillValidDraft();

      save();

      expect(await screen.findByTestId('evalsEvaluatorSubmitError')).toHaveTextContent(
        'is a built-in evaluator and cannot be redefined'
      );
      // A server rejection highlights no field, so it must not claim otherwise.
      expect(
        screen.queryByText('Fix the highlighted fields and try again.')
      ).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('adds and removes score rows', () => {
      renderCreate();

      expect(screen.getByTestId('evalsEvaluatorScoreName-0')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('evalsEvaluatorAddScore'));
      expect(screen.getByTestId('evalsEvaluatorScoreName-1')).toBeInTheDocument();

      fireEvent.click(screen.getAllByLabelText('Remove score')[1]);
      expect(screen.queryByTestId('evalsEvaluatorScoreName-1')).not.toBeInTheDocument();
    });
  });

  describe('editing', () => {
    const renderEdit = () => {
      mockedUseEvaluator.mockReturnValue({
        data: {
          evaluator: {
            name: 'tone-judge',
            version: '1.0.0',
            description: 'Rates tone',
            judge: JUDGE,
          },
        },
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useEvaluator>);
      return render(
        <EvaluatorEditorFlyout mode="edit" evaluatorName="tone-judge" onClose={onClose} />
      );
    };

    it('loads the stored definition and locks the name', () => {
      renderEdit();

      expect(screen.getByTestId('evalsEvaluatorName')).toBeDisabled();
      expect(screen.getByTestId('evalsEvaluatorName')).toHaveValue('tone-judge');
      expect(screen.getByTestId('evalsEvaluatorPrompt')).toHaveValue('Rate {{{agent_response}}}.');
    });

    it('reports the version it saved', async () => {
      renderEdit();
      setField('evalsEvaluatorDescription', 'Rates tone, strictly');

      save();

      await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
      expect(mockAddSuccess).toHaveBeenCalledWith('Saved tone-judge as version 1.1.0');
    });

    it('does not claim a version was written when nothing changed', async () => {
      updateMutateAsync.mockResolvedValueOnce({
        evaluator: { name: 'tone-judge', version: '1.0.0' },
      });
      renderEdit();

      save();

      await waitFor(() => expect(updateMutateAsync).toHaveBeenCalled());
      expect(mockAddSuccess).toHaveBeenCalledWith('No changes to save');
    });

    it('shows a failed load instead of an empty form', () => {
      mockedUseEvaluator.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('evaluator not found'),
      } as unknown as ReturnType<typeof useEvaluator>);
      render(<EvaluatorEditorFlyout mode="edit" evaluatorName="gone" onClose={onClose} />);

      expect(screen.getByText('Unable to load this evaluator')).toBeInTheDocument();
      expect(screen.queryByTestId('evalsEvaluatorPrompt')).not.toBeInTheDocument();
      expect(screen.getByTestId('evalsEvaluatorSave')).toBeDisabled();
    });
  });

  describe('testing before saving', () => {
    const runTest = () => fireEvent.click(screen.getByTestId('evalsEvaluatorRunTest'));

    const chooseConnector = () => {
      fireEvent.change(screen.getByTestId('evalsEvaluatorConnector'), {
        target: { value: 'connector-1' },
      });
    };

    it('refuses to call the server without a connector and a valid trace id', async () => {
      renderCreate();
      fillValidDraft();
      setField('evalsEvaluatorTraceId', 'not-a-trace');

      runTest();

      expect(
        await screen.findByText(
          'Select a connector and enter a valid 32-character hexadecimal trace ID.'
        )
      ).toBeInTheDocument();
      expect(resolveMutateAsync).not.toHaveBeenCalled();
      expect(testMutateAsync).not.toHaveBeenCalled();
    });

    it('rejects reference data that is not a JSON object', async () => {
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);
      setField('evalsEvaluatorReferenceData', '[1, 2, 3]');

      runTest();

      expect(await screen.findByText('Reference data must be a JSON object.')).toBeInTheDocument();
      expect(testMutateAsync).not.toHaveBeenCalled();
    });

    it('treats cleared reference data as nothing to send', async () => {
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);
      setField('evalsEvaluatorReferenceData', '   ');

      runTest();

      await waitFor(() => expect(testMutateAsync).toHaveBeenCalled());
      expect(testMutateAsync.mock.calls[0][0].subject.traces[0].reference_data).toEqual({});
    });

    it('shows the scores a judge returned without saving the draft', async () => {
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();

      expect(await screen.findByTestId('evalsEvaluatorTestResult')).toHaveTextContent('0.8');
      expect(screen.getByTestId('evalsEvaluatorTestResult')).toHaveTextContent(
        'Polite and direct.'
      );
      expect(createMutateAsync).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('falls back to a profile that supplies the declared evidence', async () => {
      resolveMutateAsync.mockResolvedValueOnce({
        recommended_instrumentation: null,
        profiles: [
          {
            profile: 'otel-genai-events',
            evidence: {
              user_query: { status: 'not_found' },
              agent_response: { status: 'not_found' },
              tool_calls: { status: 'not_found' },
            },
          },
          {
            profile: 'elastic-inference',
            evidence: {
              user_query: { status: 'found' },
              agent_response: { status: 'found' },
              tool_calls: { status: 'found' },
            },
          },
        ],
      });
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();

      await waitFor(() => expect(testMutateAsync).toHaveBeenCalled());
      expect(testMutateAsync.mock.calls[0][0].subject.instrumentation).toEqual({
        profile: 'elastic-inference',
      });
    });

    it('stops when no profile can supply the declared evidence', async () => {
      resolveMutateAsync.mockResolvedValueOnce({
        recommended_instrumentation: null,
        profiles: [
          {
            profile: 'elastic-inference',
            evidence: {
              user_query: { status: 'not_found' },
              agent_response: { status: 'content_redacted' },
              tool_calls: { status: 'not_found' },
            },
          },
        ],
      });
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();

      expect(
        await screen.findByText('No supported instrumentation profile could resolve this trace.')
      ).toBeInTheDocument();
      expect(testMutateAsync).not.toHaveBeenCalled();
    });

    it('abandons the run when the draft changes during the profile probe', async () => {
      let resolveProbe: (value: unknown) => void = () => {};
      resolveMutateAsync.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveProbe = resolve;
          })
      );
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();
      await waitFor(() => expect(resolveMutateAsync).toHaveBeenCalled());

      setField('evalsEvaluatorPrompt', 'Rate {{{agent_response}}} strictly.');
      resolveProbe({
        recommended_instrumentation: { profile: 'elastic-inference' },
        profiles: [],
      });

      // No judge is invoked for a draft that is no longer on screen.
      await waitFor(() => expect(resolveMutateAsync).toHaveBeenCalledTimes(1));
      expect(testMutateAsync).not.toHaveBeenCalled();
    });

    it('raises no instrumentation error for a draft the user has since edited', async () => {
      let resolveProbe: (value: unknown) => void = () => {};
      resolveMutateAsync.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveProbe = resolve;
          })
      );
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();
      await waitFor(() => expect(resolveMutateAsync).toHaveBeenCalled());

      setField('evalsEvaluatorPrompt', 'Rate {{{agent_response}}} strictly.');
      resolveProbe({ recommended_instrumentation: null, profiles: [] });

      await waitFor(() =>
        expect(
          screen.queryByText('No supported instrumentation profile could resolve this trace.')
        ).not.toBeInTheDocument()
      );
      expect(testMutateAsync).not.toHaveBeenCalled();
    });

    it('discards a result for a draft the user has since edited', async () => {
      let resolveTest: (value: unknown) => void = () => {};
      testMutateAsync.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTest = resolve;
          })
      );
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();
      await waitFor(() => expect(testMutateAsync).toHaveBeenCalled());

      // The draft on screen is no longer the one being tested.
      setField('evalsEvaluatorPrompt', 'Rate {{{agent_response}}} strictly.');
      resolveTest({
        result: {
          status: 'ok',
          evaluator: { name: 'tone-judge', kind: 'llm' },
          scores: [{ name: 'tone', score: 0.8, explanation: 'Stale result.' }],
        },
      });

      await waitFor(() => expect(screen.queryByText('Stale result.')).not.toBeInTheDocument());
      expect(screen.queryByTestId('evalsEvaluatorTestResult')).not.toBeInTheDocument();
    });

    it('explains a failed test run', async () => {
      resolveMutateAsync.mockRejectedValueOnce(new Error('Trace is not ready'));
      renderCreate();
      fillValidDraft();
      chooseConnector();
      setField('evalsEvaluatorTraceId', TRACE_ID);

      runTest();

      expect(await screen.findByTestId('evalsEvaluatorSubmitError')).toHaveTextContent(
        'Trace is not ready'
      );
    });
  });
});
