/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCheckboxGroup,
  EuiFieldText,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormErrorText,
  EuiFormRow,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { KbnDangerCallout, KbnSuccessCallout } from '@kbn/ui-callout';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { NotificationsStart } from '@kbn/core/public';
import {
  UserDefinedEvaluatorDraft,
  type JudgeEvidence,
  type JudgeScore,
  type LlmJudgeConfig,
  type TestEvaluatorResponse,
} from '@kbn/evals-common';
import {
  useCreateEvaluator,
  useEvaluator,
  useResolveInstrumentation,
  useTestEvaluator,
  useUpdateEvaluator,
} from '../../hooks/use_evaluators_api';
import { useModelConnectors } from '../../hooks/use_model_connectors';
import {
  ConnectorSelector,
  type ConnectorSelectorOption,
} from '../../components/shared/connector_selector';
import { getErrorMessage } from '../../utils/get_error_message';
import { parseLabels, toFieldErrors, type FieldErrors } from './lib';
import * as i18n from './translations';

interface EvaluatorEditorFlyoutProps {
  mode: 'create' | 'edit';
  evaluatorName?: string;
  onClose: () => void;
}

interface ScoreFormValue {
  id: number;
  name: string;
  type: 'number' | 'categorical';
  description: string;
  labels: string;
}

const EMPTY_SCORE: ScoreFormValue = {
  id: 0,
  name: '',
  type: 'number',
  description: '',
  labels: '',
};

const TRACE_ID_PATTERN = /^[0-9a-fA-F]{32}$/;
const EVIDENCE_PROFILE_KEYS = {
  input: 'user_query',
  response: 'agent_response',
  steps: 'tool_calls',
} as const;

const toScoreFormValue = (score: JudgeScore, id: number): ScoreFormValue => ({
  id,
  name: score.name,
  type: score.type,
  description: score.description ?? '',
  labels: (score.labels ?? [])
    .map(({ value, score: labelScore }) => `${value}=${labelScore}`)
    .join('\n'),
});

const resultValue = (score: NonNullable<TestEvaluatorResponse['result']['scores']>[number]) =>
  score.label ?? (score.score === null || score.score === undefined ? '' : String(score.score));

export const EvaluatorEditorFlyout: React.FC<EvaluatorEditorFlyoutProps> = ({
  mode,
  evaluatorName,
  onClose,
}) => {
  const titleId = useGeneratedHtmlId();
  const { services } = useKibana<{ notifications?: NotificationsStart }>();
  const toasts = services.notifications?.toasts;
  const {
    data: evaluatorData,
    isLoading: isLoadingEvaluator,
    error: loadEvaluatorError,
  } = useEvaluator(mode === 'edit' ? evaluatorName : undefined);
  const { connectors, isLoading: isLoadingConnectors } = useModelConnectors();
  const createEvaluator = useCreateEvaluator();
  const updateEvaluator = useUpdateEvaluator();
  const testEvaluator = useTestEvaluator();
  const resolveInstrumentation = useResolveInstrumentation();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [prompt, setPrompt] = useState('');
  const [evidence, setEvidence] = useState<JudgeEvidence>(['response']);
  const [referenceDataKeys, setReferenceDataKeys] = useState('');
  const [scores, setScores] = useState<ScoreFormValue[]>([{ ...EMPTY_SCORE }]);
  const [nextScoreId, setNextScoreId] = useState(1);
  const [connectorId, setConnectorId] = useState('');
  const [traceId, setTraceId] = useState('');
  const [referenceData, setReferenceData] = useState('{}');
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Kept apart from `formError` because a server rejection highlights no field, and
  // routing it through EuiForm would title it "address the highlighted errors".
  const [submitError, setSubmitError] = useState<{ title: string; message: string } | null>(null);
  const [testResult, setTestResult] = useState<TestEvaluatorResponse['result'] | null>(null);
  const testRunIdRef = useRef(0);

  useEffect(() => {
    // Any edit invalidates a result or error describing the previous draft, including one
    // from a run still in flight.
    testRunIdRef.current += 1;
    setFormError(null);
    setFieldErrors({});
    setSubmitError(null);
    setTestResult(null);
  }, [
    connectorId,
    description,
    evidence,
    name,
    prompt,
    referenceData,
    referenceDataKeys,
    scores,
    systemPrompt,
    traceId,
  ]);

  useEffect(() => {
    const evaluator = evaluatorData?.evaluator;
    if (mode !== 'edit' || !evaluator?.judge) {
      return;
    }

    setName(evaluator.name);
    setDescription(evaluator.description);
    setSystemPrompt(evaluator.judge.system_prompt);
    setPrompt(evaluator.judge.prompt);
    setEvidence(evaluator.judge.evidence);
    setReferenceDataKeys((evaluator.judge.reference_data_keys ?? []).join(', '));
    setScores(evaluator.judge.output.scores.map(toScoreFormValue));
    setNextScoreId(evaluator.judge.output.scores.length);
  }, [evaluatorData, mode]);

  const connectorOptions = useMemo<ConnectorSelectorOption[]>(
    () => connectors.map((connector) => ({ label: connector.name, value: connector.id })),
    [connectors]
  );
  const evidenceMap = Object.fromEntries(
    ['input', 'response', 'steps'].map((key) => [
      key,
      evidence.includes(key as JudgeEvidence[number]),
    ])
  );

  const updateScore = (id: number, updates: Partial<ScoreFormValue>) => {
    setScores((current) =>
      current.map((score) => (score.id === id ? { ...score, ...updates } : score))
    );
  };

  const buildDraft = (): LlmJudgeConfig | undefined => {
    const parsedScores: JudgeScore[] = [];
    for (const score of scores) {
      const scoreName = score.name.trim();
      if (!scoreName) {
        setFieldErrors({ scores: i18n.SCORES_INVALID_ERROR });
        setFormError(i18n.HIGHLIGHTED_FIELDS_ERROR);
        return undefined;
      }

      if (score.type === 'categorical') {
        const labels = parseLabels(score.labels);
        if (!labels) {
          setFieldErrors({ scores: i18n.INVALID_LABELS_ERROR });
          setFormError(i18n.INVALID_LABELS_ERROR);
          return undefined;
        }
        parsedScores.push({
          name: scoreName,
          type: score.type,
          labels,
          ...(score.description.trim() ? { description: score.description.trim() } : {}),
        });
        continue;
      }

      parsedScores.push({
        name: scoreName,
        type: score.type,
        ...(score.description.trim() ? { description: score.description.trim() } : {}),
      });
    }

    const judge: LlmJudgeConfig = {
      system_prompt: systemPrompt.trim(),
      prompt: prompt.trim(),
      evidence,
      reference_data_keys: referenceDataKeys
        .split(',')
        .map((key) => key.trim())
        .filter(Boolean),
      output: { scores: parsedScores },
    };
    const draft = { name: name.trim(), description: description.trim(), judge };
    const parsed = UserDefinedEvaluatorDraft.safeParse(draft);
    if (!parsed.success) {
      const nextFieldErrors = toFieldErrors(parsed.error.issues);
      setFieldErrors(nextFieldErrors);
      setFormError(
        Object.keys(nextFieldErrors).length > 0
          ? i18n.HIGHLIGHTED_FIELDS_ERROR
          : i18n.REQUIRED_FIELDS_ERROR
      );
      return undefined;
    }
    return judge;
  };

  const onSave = async () => {
    setFormError(null);
    setFieldErrors({});
    setSubmitError(null);
    const judge = buildDraft();
    if (!judge) {
      return;
    }

    try {
      if (mode === 'create') {
        const created = await createEvaluator.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          judge,
        });
        toasts?.addSuccess(i18n.CREATE_SUCCESS(created.evaluator.name));
      } else if (evaluatorName) {
        const updated = await updateEvaluator.mutateAsync({
          name: evaluatorName,
          updates: { description: description.trim(), judge },
        });
        // The server declines to write a version identical to the current one, so reporting
        // a version here would claim an edit that never happened.
        toasts?.addSuccess(
          updated.evaluator.version === evaluatorData?.evaluator.version
            ? i18n.NO_CHANGES_TO_SAVE
            : i18n.UPDATE_SUCCESS(updated.evaluator.name, updated.evaluator.version)
        );
      }
      onClose();
    } catch (error) {
      setSubmitError({ title: i18n.SAVE_ERROR_TITLE, message: getErrorMessage(error) });
    }
  };

  const onTest = async () => {
    // Editing a field clears the result, so a run that finishes afterwards describes a draft
    // that is no longer on screen. Only the newest run may report.
    const runId = testRunIdRef.current + 1;
    testRunIdRef.current = runId;
    const isStaleRun = () => testRunIdRef.current !== runId;

    setFormError(null);
    setFieldErrors({});
    setSubmitError(null);
    setTestResult(null);
    const judge = buildDraft();
    if (!judge) {
      return;
    }
    if (!connectorId || !TRACE_ID_PATTERN.test(traceId.trim())) {
      setFormError(i18n.TEST_FIELDS_ERROR);
      return;
    }

    // The field is optional, so clearing it reads as "send nothing", not as invalid JSON.
    const trimmedReferenceData = referenceData.trim();
    let parsedReferenceData: Record<string, unknown>;
    try {
      const parsed = trimmedReferenceData ? (JSON.parse(trimmedReferenceData) as unknown) : {};
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        throw new Error();
      }
      parsedReferenceData = parsed as Record<string, unknown>;
    } catch {
      setFormError(i18n.INVALID_REFERENCE_DATA_ERROR);
      return;
    }

    try {
      const instrumentation = await resolveInstrumentation.mutateAsync(traceId.trim());
      // Checked before the judge call, so an edit during the probe costs no model invocation
      // and cannot raise an error against a draft that has since changed.
      if (isStaleRun()) {
        return;
      }
      const resolvedProfile =
        instrumentation.recommended_instrumentation?.profile ??
        instrumentation.profiles.find((profile) =>
          evidence.every((key) => profile.evidence[EVIDENCE_PROFILE_KEYS[key]].status === 'found')
        )?.profile;
      if (!resolvedProfile) {
        setFormError(i18n.NO_INSTRUMENTATION_ERROR);
        return;
      }
      const response = await testEvaluator.mutateAsync({
        definition: { name: name.trim(), description: description.trim(), judge },
        connector_id: connectorId,
        subject: {
          traces: [{ trace_id: traceId.trim(), reference_data: parsedReferenceData }],
          instrumentation: { profile: resolvedProfile },
        },
      });
      if (isStaleRun()) {
        return;
      }
      setTestResult(response.result);
    } catch (error) {
      if (isStaleRun()) {
        return;
      }
      setSubmitError({ title: i18n.TEST_ERROR_TITLE, message: getErrorMessage(error) });
    }
  };

  const isSaving = createEvaluator.isLoading || updateEvaluator.isLoading;
  const isTesting = testEvaluator.isLoading || resolveInstrumentation.isLoading;
  const TestResultCallout = testResult?.status === 'ok' ? KbnSuccessCallout : KbnDangerCallout;

  return (
    <EuiFlyout ownFocus onClose={onClose} size="l" aria-labelledby={titleId}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id={titleId}>
            {mode === 'create' ? i18n.CREATE_FLYOUT_TITLE : i18n.EDIT_FLYOUT_TITLE}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {mode === 'edit' && isLoadingEvaluator ? (
          <EuiLoadingSpinner size="xl" />
        ) : loadEvaluatorError ? (
          <KbnDangerCallout
            announceOnMount
            title={i18n.LOAD_EVALUATOR_ERROR_TITLE}
            data-test-subj="evalsEvaluatorLoadError"
            text={<p>{getErrorMessage(loadEvaluatorError)}</p>}
          />
        ) : (
          <EuiForm isInvalid={Boolean(formError)} error={formError ?? undefined} component="form">
            {submitError ? (
              <>
                <KbnDangerCallout
                  announceOnMount
                  title={submitError.title}
                  data-test-subj="evalsEvaluatorSubmitError"
                  text={<p>{submitError.message}</p>}
                />
                <EuiSpacer size="m" />
              </>
            ) : null}
            <EuiFormRow
              label={i18n.NAME_LABEL}
              helpText={i18n.NAME_HELP}
              isInvalid={Boolean(fieldErrors.name)}
              error={fieldErrors.name}
              fullWidth
            >
              <EuiFieldText
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={mode === 'edit'}
                isInvalid={Boolean(fieldErrors.name)}
                maxLength={128}
                fullWidth
                data-test-subj="evalsEvaluatorName"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.DESCRIPTION_LABEL}
              isInvalid={Boolean(fieldErrors.description)}
              error={fieldErrors.description}
              fullWidth
            >
              <EuiTextArea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                isInvalid={Boolean(fieldErrors.description)}
                maxLength={2048}
                fullWidth
                data-test-subj="evalsEvaluatorDescription"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.SYSTEM_PROMPT_LABEL}
              isInvalid={Boolean(fieldErrors.systemPrompt)}
              error={fieldErrors.systemPrompt}
              fullWidth
            >
              <EuiTextArea
                value={systemPrompt}
                onChange={(event) => setSystemPrompt(event.target.value)}
                isInvalid={Boolean(fieldErrors.systemPrompt)}
                fullWidth
                data-test-subj="evalsEvaluatorSystemPrompt"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.PROMPT_LABEL}
              helpText={i18n.PROMPT_HELP}
              isInvalid={Boolean(fieldErrors.prompt)}
              error={fieldErrors.prompt}
              fullWidth
            >
              <EuiTextArea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                isInvalid={Boolean(fieldErrors.prompt)}
                fullWidth
                data-test-subj="evalsEvaluatorPrompt"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.EVIDENCE_LABEL}
              labelType="legend"
              isInvalid={Boolean(fieldErrors.evidence)}
              error={fieldErrors.evidence}
              fullWidth
            >
              <EuiCheckboxGroup
                options={[
                  { id: 'input', label: i18n.INPUT_EVIDENCE },
                  { id: 'response', label: i18n.RESPONSE_EVIDENCE },
                  { id: 'steps', label: i18n.STEPS_EVIDENCE },
                ]}
                idToSelectedMap={evidenceMap}
                onChange={(id) =>
                  setEvidence((current) =>
                    current.includes(id as JudgeEvidence[number])
                      ? current.filter((key) => key !== id)
                      : [...current, id as JudgeEvidence[number]]
                  )
                }
                data-test-subj="evalsEvaluatorEvidence"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.REFERENCE_DATA_LABEL}
              helpText={i18n.REFERENCE_DATA_HELP}
              isInvalid={Boolean(fieldErrors.referenceDataKeys)}
              error={fieldErrors.referenceDataKeys}
              fullWidth
            >
              <EuiFieldText
                value={referenceDataKeys}
                onChange={(event) => setReferenceDataKeys(event.target.value)}
                isInvalid={Boolean(fieldErrors.referenceDataKeys)}
                fullWidth
                data-test-subj="evalsEvaluatorReferenceKeys"
              />
            </EuiFormRow>

            <EuiSpacer size="m" />
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
              <EuiFlexItem>
                <EuiTitle size="s">
                  <h3>{i18n.SCORES_TITLE}</h3>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  size="s"
                  iconType="plusCircle"
                  onClick={() => {
                    setScores((current) => [...current, { ...EMPTY_SCORE, id: nextScoreId }]);
                    setNextScoreId((current) => current + 1);
                  }}
                  data-test-subj="evalsEvaluatorAddScore"
                >
                  {i18n.ADD_SCORE_BUTTON}
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            {fieldErrors.scores ? (
              <EuiFormErrorText data-test-subj="evalsEvaluatorScoresError">
                {fieldErrors.scores}
              </EuiFormErrorText>
            ) : null}
            <EuiSpacer size="s" />
            {scores.map((score) => (
              <React.Fragment key={score.id}>
                <EuiPanel hasBorder hasShadow={false} paddingSize="m">
                  <EuiFlexGroup alignItems="flexStart">
                    <EuiFlexItem>
                      <EuiFormRow
                        label={i18n.SCORE_NAME_LABEL}
                        isInvalid={Boolean(fieldErrors.scores) && !score.name.trim()}
                        fullWidth
                      >
                        <EuiFieldText
                          value={score.name}
                          onChange={(event) => updateScore(score.id, { name: event.target.value })}
                          isInvalid={Boolean(fieldErrors.scores) && !score.name.trim()}
                          fullWidth
                          data-test-subj={`evalsEvaluatorScoreName-${score.id}`}
                        />
                      </EuiFormRow>
                    </EuiFlexItem>
                    <EuiFlexItem>
                      <EuiFormRow label={i18n.SCORE_TYPE_LABEL} fullWidth>
                        <EuiSelect
                          value={score.type}
                          onChange={(event) =>
                            updateScore(score.id, {
                              type: event.target.value as ScoreFormValue['type'],
                            })
                          }
                          options={[
                            { value: 'number', text: i18n.NUMERIC_SCORE },
                            { value: 'categorical', text: i18n.CATEGORICAL_SCORE },
                          ]}
                          fullWidth
                          data-test-subj={`evalsEvaluatorScoreType-${score.id}`}
                        />
                      </EuiFormRow>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiSpacer size="l" />
                      <EuiToolTip content={i18n.REMOVE_SCORE_ARIA_LABEL} disableScreenReaderOutput>
                        <EuiButtonIcon
                          iconType="trash"
                          color="danger"
                          aria-label={i18n.REMOVE_SCORE_ARIA_LABEL}
                          disabled={scores.length === 1}
                          onClick={() =>
                            setScores((current) => current.filter(({ id }) => id !== score.id))
                          }
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiFormRow label={i18n.SCORE_DESCRIPTION_LABEL} fullWidth>
                    <EuiTextArea
                      value={score.description}
                      onChange={(event) =>
                        updateScore(score.id, { description: event.target.value })
                      }
                      fullWidth
                      data-test-subj={`evalsEvaluatorScoreDescription-${score.id}`}
                    />
                  </EuiFormRow>
                  {score.type === 'categorical' && (
                    <EuiFormRow label={i18n.LABELS_LABEL} helpText={i18n.LABELS_HELP} fullWidth>
                      <EuiTextArea
                        value={score.labels}
                        onChange={(event) => updateScore(score.id, { labels: event.target.value })}
                        fullWidth
                        data-test-subj={`evalsEvaluatorScoreLabels-${score.id}`}
                      />
                    </EuiFormRow>
                  )}
                </EuiPanel>
                <EuiSpacer size="s" />
              </React.Fragment>
            ))}

            <EuiSpacer size="m" />
            <EuiTitle size="s">
              <h3>{i18n.TEST_TITLE}</h3>
            </EuiTitle>
            <EuiText size="s">
              <p>{i18n.TEST_DESCRIPTION}</p>
            </EuiText>
            <EuiSpacer size="s" />
            <ConnectorSelector
              label={i18n.CONNECTOR_LABEL}
              connectorOptions={connectorOptions}
              selectedConnectorIds={connectorId ? [connectorId] : []}
              onChange={(selected) => setConnectorId(selected[0] ?? '')}
              isLoading={isLoadingConnectors}
              singleSelection
              dataTestSubj="evalsEvaluatorConnector"
            />
            <EuiFormRow label={i18n.TRACE_ID_LABEL} fullWidth>
              <EuiFieldText
                value={traceId}
                onChange={(event) => setTraceId(event.target.value)}
                maxLength={32}
                fullWidth
                data-test-subj="evalsEvaluatorTraceId"
              />
            </EuiFormRow>
            <EuiFormRow
              label={i18n.REFERENCE_DATA_JSON_LABEL}
              helpText={i18n.REFERENCE_DATA_JSON_HELP}
              fullWidth
            >
              <EuiTextArea
                value={referenceData}
                onChange={(event) => setReferenceData(event.target.value)}
                fullWidth
                data-test-subj="evalsEvaluatorReferenceData"
              />
            </EuiFormRow>
            <EuiButton
              onClick={onTest}
              isLoading={isTesting}
              disabled={isSaving}
              data-test-subj="evalsEvaluatorRunTest"
            >
              {i18n.RUN_TEST_BUTTON}
            </EuiButton>
            {testResult && (
              <>
                <EuiSpacer size="s" />
                <TestResultCallout
                  announceOnMount
                  title={
                    testResult.status === 'ok' ? i18n.TEST_SUCCEEDED_TITLE : i18n.TEST_FAILED_TITLE
                  }
                  data-test-subj="evalsEvaluatorTestResult"
                  text={
                    <>
                      {testResult.error ? <p>{testResult.error.message}</p> : null}
                      {(testResult.scores ?? []).map((score) => (
                        <p key={score.name}>
                          <strong>{i18n.SCORE_RESULT(score.name, resultValue(score))}</strong>
                          {score.explanation
                            ? ` ${i18n.SCORE_EXPLANATION(score.explanation)}`
                            : null}
                        </p>
                      ))}
                    </>
                  }
                />
              </>
            )}
          </EuiForm>
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>{i18n.CANCEL_BUTTON}</EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={onSave}
              isLoading={isSaving}
              disabled={
                isTesting || Boolean(loadEvaluatorError) || (mode === 'edit' && isLoadingEvaluator)
              }
              data-test-subj="evalsEvaluatorSave"
            >
              {i18n.SAVE_BUTTON}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
