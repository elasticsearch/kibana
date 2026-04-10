/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type {
  TutorialStep,
  SnippetVariableKey,
  TutorialSlug,
} from '../../../hooks/use_tutorial_content';
import {
  useTutorialContent,
  BULK_INGEST_SNIPPET_PREFIX,
} from '../../../hooks/use_tutorial_content';
import {
  useExecuteTutorialStep,
  insertValues,
  StepExecutionError,
  type EsResponse,
} from '../../../hooks/use_execute_tutorial_step';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepState {
  status: StepStatus;
  response?: EsResponse;
  error?: string;
}

export interface ResolvedStep {
  /** Original step definition */
  source: TutorialStep;
  /** Step content with all known {{variables}} substituted */
  resolved: {
    header: string;
    description: string;
    explanation: string;
    apiSnippet: string;
  };
  /** Execution state for this step */
  state: StepState;
}

export interface TutorialState {
  selectedTutorial: TutorialSlug;
  currentStep: number;
  savedValues: Record<SnippetVariableKey, string>;
  stepStates: StepState[];
  completed: boolean;
  started: boolean;
}

const resolveStepContent = (
  step: TutorialStep,
  savedValues: Record<SnippetVariableKey, string>
) => ({
  header: insertValues(step.header, savedValues),
  description: insertValues(step.description, savedValues),
  explanation: insertValues(step.explanation, savedValues),
  apiSnippet: insertValues(step.apiSnippet, savedValues),
});

export const useTutorialState = (slug: TutorialSlug) => {
  const execute = useExecuteTutorialStep();
  const { steps: rawSteps, globalVariables, sampleData, cleanup } = useTutorialContent(slug);
  const initialSavedValues = useMemo(() => ({ ...globalVariables }), [globalVariables]);
  const totalStepCount = rawSteps.length + (cleanup?.length ? 1 : 0);

  const [state, setState] = useState<TutorialState>(() => ({
    selectedTutorial: slug,
    currentStep: 0,
    savedValues: { ...initialSavedValues },
    stepStates: rawSteps.map(() => ({ status: 'pending' as StepStatus })),
    completed: false,
    started: false,
  }));

  const steps: ResolvedStep[] = useMemo(
    () =>
      rawSteps.map((step, i) => ({
        source: step,
        resolved: resolveStepContent(step, state.savedValues),
        state: state.stepStates[i] ?? { status: 'pending' },
      })),
    [rawSteps, state.savedValues, state.stepStates]
  );

  const isStepReady = useCallback(
    (stepIndex: number): boolean => {
      const step = rawSteps[stepIndex];
      if (!step) return false;
      return step.valuesToInsert.every((key) => key in state.savedValues);
    },
    [rawSteps, state.savedValues]
  );

  const savedValuesRef = useRef(state.savedValues);
  savedValuesRef.current = state.savedValues;

  const executeStep = useCallback(
    async (stepIndex: number) => {
      const step = rawSteps[stepIndex];
      if (!step) return;

      setState((prev) => {
        const nextStepStates = [...prev.stepStates];
        nextStepStates[stepIndex] = { status: 'running' };
        return { ...prev, stepStates: nextStepStates, started: true };
      });

      try {
        const currentValues = savedValuesRef.current;
        const stepToExecute =
          step.type === 'ingestData' && sampleData
            ? { ...step, apiSnippet: `${BULK_INGEST_SNIPPET_PREFIX}\n${sampleData}` }
            : step;
        const result = await execute(stepToExecute, currentValues);

        setState((prev) => {
          const nextStepStates = [...prev.stepStates];
          nextStepStates[stepIndex] = { status: 'completed', response: result.response };
          return {
            ...prev,
            stepStates: nextStepStates,
            savedValues: { ...prev.savedValues, ...result.extractedValues },
          };
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failedResponse = err instanceof StepExecutionError ? err.response : undefined;
        setState((prev) => {
          const nextStepStates = [...prev.stepStates];
          nextStepStates[stepIndex] = {
            status: 'failed',
            error: message,
            response: failedResponse,
          };
          return { ...prev, stepStates: nextStepStates };
        });
        throw err;
      }
    },
    [execute, rawSteps, sampleData]
  );

  const advanceStep = useCallback(() => {
    setState((prev) => {
      const nextStep = prev.currentStep + 1;
      return {
        ...prev,
        currentStep: nextStep,
        completed: nextStep >= totalStepCount,
      };
    });
  }, [totalStepCount]);

  const reset = useCallback(() => {
    setState({
      selectedTutorial: slug,
      currentStep: 0,
      savedValues: { ...initialSavedValues },
      stepStates: rawSteps.map(() => ({ status: 'pending' })),
      completed: false,
      started: false,
    });
  }, [slug, rawSteps, initialSavedValues]);

  return { state, steps, executeStep, advanceStep, isStepReady, reset };
};
