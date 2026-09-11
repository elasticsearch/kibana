/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
  type EuiComboBoxOptionOption,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useHistory } from 'react-router-dom';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type {
  LaunchedExperimentConfig,
  RunExperimentRequest,
  SaveAsWorkflowResponse,
} from '../../../common/experiments/run_experiment';
import { EXPERIMENT_LIMITS } from '../../../common/experiments/run_experiment';
import { useDatasets } from '../../hooks/use_evals_api';
import {
  useAgentBuilderAgents,
  useExperimentTemplates,
  useRunExperiment,
  useSaveExperimentWorkflow,
  usePreviewExperiment,
} from '../../hooks/use_experiments_api';
import { useEvaluators } from '../../hooks/use_evaluators_api';
import { useModelConnectors } from '../../hooks/use_model_connectors';
import { useAccessibleSpaces } from '../../hooks/use_spaces';
import { WorkflowYamlPreview } from '../workflow_yaml_preview';
import { ConnectorSelector, type ConnectorSelectorOption } from '../shared/connector_selector';
import { EvaluatorSelector, type SelectedEvaluator } from '../shared/evaluator_selector';
import { SavedWorkflowSuccess } from './saved_workflow_success';
import { newExperimentStrings } from './translations';

const BUILT_IN_TARGETS = ['inference', 'agentBuilder.converse'] as const;
type BuiltInTarget = (typeof BUILT_IN_TARGETS)[number];
const isBuiltInTarget = (value: string): value is BuiltInTarget =>
  (BUILT_IN_TARGETS as readonly string[]).includes(value);

const isCountInRange = (value: number | undefined, max: number): boolean =>
  value === undefined || (Number.isInteger(value) && value >= 1 && value <= max);

export interface NewExperimentFlyoutProps {
  onClose: () => void;
}

export const NewExperimentFlyout: React.FC<NewExperimentFlyoutProps> = ({ onClose }) => {
  const history = useHistory();
  const { services } = useKibana();
  const toasts = services.notifications?.toasts;
  const flyoutTitleId = useGeneratedHtmlId();

  const { connectors, isLoading: connectorsLoading } = useModelConnectors();
  const { data: datasetsData, isLoading: datasetsLoading } = useDatasets({ perPage: 1000 });
  const { data: evaluatorsData, isLoading: evaluatorsLoading } = useEvaluators();
  const { data: templatesData } = useExperimentTemplates();

  const runExperiment = useRunExperiment();
  const saveWorkflow = useSaveExperimentWorkflow();
  // Set once "Save as workflow" succeeds. Flips the flyout from the form to a
  // success state so the just-created workflow isn't a dead-end (open/run it).
  const [savedWorkflow, setSavedWorkflow] = useState<SaveAsWorkflowResponse | null>(null);
  const preview = usePreviewExperiment();

  const [name, setName] = useState('');
  const [connectorIds, setConnectorIds] = useState<string[]>([]);
  const [taskTarget, setTaskTarget] = useState<string>('inference');
  const [agentId, setAgentId] = useState('');
  const [datasetIds, setDatasetIds] = useState<string[]>([]);
  const [evaluators, setEvaluators] = useState<SelectedEvaluator[]>([]);
  const [repetitions, setRepetitions] = useState<number | undefined>(1);
  const [concurrency, setConcurrency] = useState<number | undefined>(5);
  const [compare, setCompare] = useState(false);
  const [showYaml, setShowYaml] = useState(false);
  const [spaceIds, setSpaceIds] = useState<string[]>([]);

  const {
    isEnabled: spacesEnabled,
    isLoading: spacesLoading,
    activeSpaceId,
    spaces,
  } = useAccessibleSpaces();

  const spacesInitialized = useRef(false);
  useEffect(() => {
    if (!spacesInitialized.current && activeSpaceId) {
      setSpaceIds([activeSpaceId]);
      spacesInitialized.current = true;
    }
  }, [activeSpaceId]);

  const isCrossModel = connectorIds.length >= 2;

  const { data: agentsData, isLoading: agentsLoading } = useAgentBuilderAgents({
    enabled: taskTarget === 'agentBuilder.converse',
  });

  const connectorOptions = useMemo<ConnectorSelectorOption[]>(
    () => connectors.map((c) => ({ label: c.name, value: c.id })),
    [connectors]
  );

  const datasetOptions = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () => (datasetsData?.datasets ?? []).map((d) => ({ label: d.name, value: d.id })),
    [datasetsData]
  );

  const agentOptions = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () =>
      (agentsData ?? []).map((agent) => ({
        label: agent.name && agent.name !== agent.id ? `${agent.name} (${agent.id})` : agent.id,
        value: agent.id,
      })),
    [agentsData]
  );

  const spaceOptions = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () =>
      spaces.map((space) => ({
        value: space.id,
        label:
          space.id === activeSpaceId
            ? i18n.translate('xpack.evals.newExperiment.currentSpaceOption', {
                defaultMessage: '{name} (current)',
                values: { name: space.name },
              })
            : space.name,
      })),
    [spaces, activeSpaceId]
  );

  const taskTargetOptions = useMemo<Array<EuiComboBoxOptionOption<string>>>(() => {
    const options: Array<EuiComboBoxOptionOption<string>> = [
      {
        value: 'inference',
        label: i18n.translate('xpack.evals.newExperiment.target.inference', {
          defaultMessage: 'Direct model invocation (inference)',
        }),
      },
      {
        value: 'agentBuilder.converse',
        label: i18n.translate('xpack.evals.newExperiment.target.converse', {
          defaultMessage: 'Agent Builder agent (converse)',
        }),
      },
    ];
    for (const template of templatesData?.templates ?? []) {
      if (template.kind === 'task_provider') {
        options.push({ value: template.id, label: template.name });
      }
    }
    return options;
  }, [templatesData?.templates]);

  // Only send `space_ids` when the user targets spaces beyond the current one.
  // Leaving the default (just the current space, or nothing) omits it so saved
  // workflows stay portable and stamp whichever space they run in.
  const isDefaultSpaceSelection =
    spaceIds.length === 0 || (spaceIds.length === 1 && spaceIds[0] === activeSpaceId);

  const buildRequestBody = useCallback((): RunExperimentRequest => {
    return {
      name: name.trim() || undefined,
      connector_ids: connectorIds,
      agent_id: taskTarget === 'agentBuilder.converse' ? agentId.trim() || undefined : undefined,
      task_ref: !isBuiltInTarget(taskTarget) ? taskTarget : undefined,
      dataset_ids: datasetIds,
      evaluators: evaluators.map((e) => ({
        name: e.name,
        version: e.version,
        connector_id: e.kind === 'llm' ? e.connectorId : undefined,
      })),
      repetitions,
      concurrency,
      compare: compare || undefined,
      space_ids: spacesEnabled && !isDefaultSpaceSelection ? spaceIds : undefined,
    };
  }, [
    name,
    connectorIds,
    taskTarget,
    agentId,
    datasetIds,
    evaluators,
    repetitions,
    concurrency,
    compare,
    spacesEnabled,
    isDefaultSpaceSelection,
    spaceIds,
  ]);

  const labelFor = useCallback(
    (options: Array<EuiComboBoxOptionOption<string>>, id: string): string =>
      options.find((option) => option.value === id)?.label ?? id,
    []
  );

  const labelsFor = useCallback(
    (options: Array<EuiComboBoxOptionOption<string>>, ids: string[]): string[] =>
      ids.map((id) => labelFor(options, id)),
    [labelFor]
  );

  const buildLaunchedConfig = useCallback(
    (): LaunchedExperimentConfig => ({
      name: name.trim() || undefined,
      target_label:
        taskTargetOptions.find((option) => option.value === taskTarget)?.label ?? taskTarget,
      agent_id: taskTarget === 'agentBuilder.converse' ? agentId.trim() || undefined : undefined,
      connector_names: labelsFor(connectorOptions, connectorIds),
      dataset_names: labelsFor(datasetOptions, datasetIds),
      evaluator_names: evaluators.map((evaluator) => evaluator.name),
      evaluator_judges: evaluators.flatMap((evaluator) =>
        evaluator.kind === 'llm' && evaluator.connectorId
          ? [
              {
                evaluator_name: evaluator.name,
                judge_label: labelFor(connectorOptions, evaluator.connectorId),
              },
            ]
          : []
      ),
      repetitions,
      concurrency,
    }),
    [
      name,
      taskTargetOptions,
      taskTarget,
      agentId,
      labelFor,
      labelsFor,
      connectorOptions,
      connectorIds,
      datasetOptions,
      datasetIds,
      evaluators,
      repetitions,
      concurrency,
    ]
  );

  const missingJudge = evaluators.some((e) => e.kind === 'llm' && !e.connectorId);
  const missingAgent = taskTarget === 'agentBuilder.converse' && !agentId.trim();
  const invalidRepetitions = !isCountInRange(repetitions, EXPERIMENT_LIMITS.maxRepetitions);
  const invalidConcurrency = !isCountInRange(concurrency, EXPERIMENT_LIMITS.maxConcurrency);
  const isValid =
    connectorIds.length > 0 &&
    datasetIds.length > 0 &&
    evaluators.length > 0 &&
    !missingJudge &&
    !missingAgent &&
    !invalidRepetitions &&
    !invalidConcurrency;

  const { mutate: mutatePreview } = preview;
  useEffect(() => {
    if (!showYaml || !isValid) {
      return;
    }
    const handle = window.setTimeout(() => mutatePreview(buildRequestBody()), 300);
    return () => window.clearTimeout(handle);
  }, [showYaml, isValid, buildRequestBody, mutatePreview]);

  const onToggleYaml = useCallback((next: boolean) => setShowYaml(next), []);

  const onToggleCompare = useCallback((next: boolean) => setCompare(next), []);

  const onRunNow = useCallback(() => {
    const requestBody: RunExperimentRequest = {
      ...buildRequestBody(),
      ...(savedWorkflow ? { workflow_id: savedWorkflow.workflow_id } : {}),
    };
    runExperiment.mutate(requestBody, {
      onSuccess: (result) => {
        toasts?.addSuccess(
          i18n.translate('xpack.evals.newExperiment.runSuccess', {
            defaultMessage:
              'Launched {count, plural, one {# workflow execution} other {# workflow executions}}.',
            values: { count: result.workflow_execution_ids.length },
          })
        );
        onClose();

        // Cross-model runs fan out into one experiment (and one list row) per
        // model, each with its own execution id. There is no single experiment to
        // land on, so route to the run overview, which shows per-model progress and
        // links to each model's detail (and a compare action) once results land.
        if (result.mode === 'cross-model') {
          const params = new URLSearchParams();
          for (const execution of result.executions) {
            params.append('workflow_execution_id', execution.workflow_execution_id);
            params.append('execution_id', execution.execution_id);
            params.append('connector', execution.connector_id);
          }
          history.push({
            pathname: '/runs',
            search: `?${params.toString()}`,
            state: {
              experimentConfig: buildLaunchedConfig(),
              experimentRequest: requestBody,
              connectorNamesById: Object.fromEntries(
                connectorIds.map((id) => [
                  id,
                  connectorOptions.find((o) => o.value === id)?.label ?? id,
                ])
              ),
            },
          });
          return;
        }

        // Single / dataset-fanout runs share one experiment id and execution id, so
        // land on the experiment detail page. WorkflowRunProgress renders one card
        // per launched execution while the run is in flight.
        const detailPathId = result.experiment_ids[0] ?? result.execution_id;
        const params = new URLSearchParams({ execution_id: result.execution_id });
        for (const workflowExecutionId of result.workflow_execution_ids) {
          params.append('workflow_execution_id', workflowExecutionId);
        }

        history.push({
          pathname: `/experiments/${encodeURIComponent(detailPathId)}`,
          search: `?${params.toString()}`,
          state: { experimentConfig: buildLaunchedConfig(), experimentRequest: requestBody },
        });
      },
      onError: (error) => {
        toasts?.addError(error as Error, {
          title: i18n.translate('xpack.evals.newExperiment.runError', {
            defaultMessage: 'Failed to launch experiment',
          }),
        });
      },
    });
  }, [
    buildLaunchedConfig,
    buildRequestBody,
    connectorIds,
    connectorOptions,
    history,
    onClose,
    runExperiment,
    savedWorkflow,
    toasts,
  ]);

  const onSave = useCallback(() => {
    saveWorkflow.mutate(buildRequestBody(), {
      onSuccess: (result) => {
        setSavedWorkflow(result);
      },
      onError: (error) => {
        toasts?.addError(error as Error, {
          title: i18n.translate('xpack.evals.newExperiment.saveError', {
            defaultMessage: 'Failed to save workflow',
          }),
        });
      },
    });
  }, [buildRequestBody, saveWorkflow, toasts]);

  const selectedDatasetOptions = datasetOptions.filter((o) =>
    datasetIds.includes(o.value as string)
  );
  const selectedAgentOptions = agentId
    ? [agentOptions.find((o) => o.value === agentId) ?? { label: agentId, value: agentId }]
    : [];
  const selectedSpaceOptions = spaceOptions.filter((o) => spaceIds.includes(o.value as string));

  const savedWorkflowHref =
    savedWorkflow && services.http
      ? services.http.basePath.prepend(
          `/app/workflows/${encodeURIComponent(savedWorkflow.workflow_id)}`
        )
      : undefined;

  if (savedWorkflow) {
    return (
      <SavedWorkflowSuccess
        savedWorkflow={savedWorkflow}
        savedWorkflowHref={savedWorkflowHref}
        isRunning={runExperiment.isLoading}
        onRunNow={onRunNow}
        onClose={onClose}
      />
    );
  }

  return (
    <EuiFlyout
      onClose={onClose}
      size="m"
      ownFocus
      aria-labelledby={flyoutTitleId}
      data-test-subj="evalsNewExperimentFlyout"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id={flyoutTitleId}>{newExperimentStrings.title}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiForm component="form">
          <EuiFormRow label={newExperimentStrings.nameLabel} fullWidth>
            <EuiFieldText
              fullWidth
              value={name}
              placeholder={newExperimentStrings.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
              data-test-subj="evalsExperimentName"
            />
          </EuiFormRow>

          <ConnectorSelector
            label={newExperimentStrings.connectorsLabel}
            helpText={newExperimentStrings.connectorsHelp}
            selectedConnectorIds={connectorIds}
            connectorOptions={connectorOptions}
            onChange={setConnectorIds}
            isLoading={connectorsLoading}
            dataTestSubj="evalsConnectorsCombo"
          />

          <EuiFormRow label={newExperimentStrings.taskTargetLabel} fullWidth>
            <EuiComboBox<string>
              fullWidth
              singleSelection={{ asPlainText: true }}
              isClearable={false}
              options={taskTargetOptions}
              selectedOptions={taskTargetOptions.filter((o) => o.value === taskTarget)}
              onChange={(selected) => {
                const next = selected[0]?.value;
                if (next) setTaskTarget(next);
              }}
              data-test-subj="evalsTaskTargetSelect"
            />
          </EuiFormRow>

          {taskTarget === 'agentBuilder.converse' && (
            <EuiFormRow
              label={newExperimentStrings.agentIdLabel}
              helpText={newExperimentStrings.agentIdHelp}
              fullWidth
            >
              <EuiComboBox<string>
                fullWidth
                singleSelection={{ asPlainText: true }}
                isClearable
                isLoading={agentsLoading}
                options={agentOptions}
                selectedOptions={selectedAgentOptions}
                onChange={(selected) => setAgentId((selected[0]?.value as string) ?? '')}
                onCreateOption={(value) => setAgentId(value.trim())}
                data-test-subj="evalsAgentId"
              />
            </EuiFormRow>
          )}

          <EuiFormRow label={newExperimentStrings.datasetsLabel} fullWidth>
            <EuiComboBox<string>
              fullWidth
              isLoading={datasetsLoading}
              options={datasetOptions}
              selectedOptions={selectedDatasetOptions}
              onChange={(selected) => setDatasetIds(selected.map((o) => o.value as string))}
              data-test-subj="evalsDatasetsCombo"
            />
          </EuiFormRow>

          <EvaluatorSelector
            label={newExperimentStrings.evaluatorsLabel}
            evaluators={evaluatorsData?.evaluators ?? []}
            selectedEvaluators={evaluators}
            connectorOptions={connectorOptions}
            onChange={setEvaluators}
            isEvaluatorsLoading={evaluatorsLoading}
            isConnectorsLoading={connectorsLoading}
            evaluatorsDataTestSubj="evalsEvaluatorsCombo"
            judgeConnectorDataTestSubjPrefix="evalsJudgeConnector"
          />

          <EuiSpacer size="m" />
          <EuiFlexGroup>
            <EuiFlexItem>
              <EuiFormRow
                label={newExperimentStrings.repetitionsLabel}
                fullWidth
                isInvalid={invalidRepetitions}
                error={i18n.translate('xpack.evals.newExperiment.repetitionsRangeError', {
                  defaultMessage: 'Enter a whole number between 1 and {max}.',
                  values: { max: EXPERIMENT_LIMITS.maxRepetitions },
                })}
              >
                <EuiFieldNumber
                  min={1}
                  max={EXPERIMENT_LIMITS.maxRepetitions}
                  isInvalid={invalidRepetitions}
                  value={repetitions ?? ''}
                  onChange={(e) =>
                    setRepetitions(e.target.value ? Number(e.target.value) : undefined)
                  }
                  data-test-subj="evalsRepetitions"
                  fullWidth
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiFormRow
                label={newExperimentStrings.concurrencyLabel}
                fullWidth
                isInvalid={invalidConcurrency}
                error={i18n.translate('xpack.evals.newExperiment.concurrencyRangeError', {
                  defaultMessage: 'Enter a whole number between 1 and {max}.',
                  values: { max: EXPERIMENT_LIMITS.maxConcurrency },
                })}
              >
                <EuiFieldNumber
                  min={1}
                  max={EXPERIMENT_LIMITS.maxConcurrency}
                  isInvalid={invalidConcurrency}
                  value={concurrency ?? ''}
                  onChange={(e) =>
                    setConcurrency(e.target.value ? Number(e.target.value) : undefined)
                  }
                  data-test-subj="evalsConcurrency"
                  fullWidth
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>

          {spacesEnabled && (
            <>
              <EuiSpacer size="m" />
              <EuiFormRow
                label={newExperimentStrings.spacesLabel}
                helpText={newExperimentStrings.spacesHelp}
                fullWidth
              >
                <EuiComboBox<string>
                  fullWidth
                  isLoading={spacesLoading}
                  options={spaceOptions}
                  selectedOptions={selectedSpaceOptions}
                  onChange={(selected) => setSpaceIds(selected.map((o) => o.value as string))}
                  data-test-subj="evalsSpacesCombo"
                />
              </EuiFormRow>
            </>
          )}

          {isCrossModel && (
            <>
              <EuiSpacer size="m" />
              <EuiSwitch
                label={newExperimentStrings.compareLabel}
                checked={compare}
                onChange={(e) => onToggleCompare(e.target.checked)}
                data-test-subj="evalsCompareToggle"
              />
              <EuiText size="xs" color="subdued">
                <EuiSpacer size="xs" />
                {newExperimentStrings.compareHelp}
              </EuiText>
            </>
          )}

          <EuiSpacer size="m" />
          <EuiSwitch
            label={newExperimentStrings.showYaml}
            checked={showYaml}
            onChange={(e) => onToggleYaml(e.target.checked)}
            data-test-subj="evalsShowYamlToggle"
          />
          {showYaml && (
            <>
              <EuiSpacer size="s" />
              {isValid ? (
                <WorkflowYamlPreview
                  yaml={preview.data?.yaml}
                  isLoading={preview.isLoading || (!preview.data && !preview.error)}
                  error={
                    preview.error
                      ? String((preview.error as Error).message ?? preview.error)
                      : undefined
                  }
                />
              ) : (
                <EuiText size="xs" color="subdued">
                  {i18n.translate('xpack.evals.newExperiment.previewIncomplete', {
                    defaultMessage:
                      'Select at least one connector, dataset, and evaluator to preview the YAML.',
                  })}
                </EuiText>
              )}
            </>
          )}
        </EuiForm>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty iconType="cross" onClick={onClose}>
              {newExperimentStrings.cancel}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty
                  iconType="save"
                  isLoading={saveWorkflow.isLoading}
                  isDisabled={!isValid || runExperiment.isLoading}
                  onClick={onSave}
                  data-test-subj="evalsSaveWorkflowButton"
                >
                  {newExperimentStrings.saveAsWorkflow}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  iconType="play"
                  isLoading={runExperiment.isLoading}
                  isDisabled={!isValid || saveWorkflow.isLoading}
                  onClick={onRunNow}
                  data-test-subj="evalsRunNowButton"
                >
                  {newExperimentStrings.runNow}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        {!isValid && (
          <EuiText size="xs" color="subdued" textAlign="right">
            <EuiSpacer size="xs" />
            {i18n.translate('xpack.evals.newExperiment.validationHint', {
              defaultMessage:
                'Requires at least one connector, dataset, and evaluator (with a judge connector for LLM evaluators).',
            })}
          </EuiText>
        )}
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
