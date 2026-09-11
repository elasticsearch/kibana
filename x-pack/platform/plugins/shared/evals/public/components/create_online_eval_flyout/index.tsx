/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiEmptyPrompt,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiSelect,
  EuiSwitch,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useCreateOnlineEvalWorkflow } from '../../hooks/use_online_eval_workflows';
import { useEvaluators } from '../../hooks/use_evaluators_api';
import { useModelConnectors } from '../../hooks/use_model_connectors';
import { buildOnlineEvalWorkflowYaml } from '../../../common/online_evals/workflow_yaml';
import { ConnectorSelector, type ConnectorSelectorOption } from '../shared/connector_selector';
import { EvaluatorSelector, type SelectedEvaluator } from '../shared/evaluator_selector';
import { WorkflowYamlPreview } from '../workflow_yaml_preview';

export const CreateOnlineEvalFlyout = ({ onClose }: { onClose: () => void }) => {
  const { services } = useKibana();
  const createOnlineEvalWorkflow = useCreateOnlineEvalWorkflow();
  const {
    data: evaluatorsData,
    isLoading: isLoadingEvaluators,
    error: evaluatorsError,
  } = useEvaluators();
  const {
    connectors,
    isLoading: isLoadingConnectors,
    error: connectorsError,
  } = useModelConnectors();

  const [name, setName] = React.useState('');
  const [indexPattern, setIndexPattern] = React.useState('traces-agent_builder.otel-default');
  const [extraEsqlWhere, setExtraEsqlWhere] = React.useState('');
  const [windowMinutes, setWindowMinutes] = React.useState(60);
  const [lagMinutes, setLagMinutes] = React.useState(15);
  const [maxTracesPerRun, setMaxTracesPerRun] = React.useState(25);
  const [every, setEvery] = React.useState('1h');
  const [selectedEvaluators, setSelectedEvaluators] = React.useState<SelectedEvaluator[]>([]);
  const [selectedConnectorIds, setSelectedConnectorIds] = React.useState<string[]>([]);
  const [showYamlPreview, setShowYamlPreview] = React.useState(false);
  const [createdWorkflow, setCreatedWorkflow] = React.useState<{ id: string; name: string } | null>(
    null
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const connectorOptions = React.useMemo<ConnectorSelectorOption[]>(
    () =>
      connectors.map((connector) => ({
        value: connector.id,
        label: connector.name,
      })),
    [connectors]
  );

  const combinedErrorMessage =
    errorMessage ??
    (evaluatorsError
      ? i18n.translate('xpack.evals.onlineEvaluations.createFlyout.loadEvaluatorsError', {
          defaultMessage: 'Failed to load evaluators: {message}',
          values: { message: String(evaluatorsError) },
        })
      : null) ??
    (connectorsError
      ? i18n.translate('xpack.evals.onlineEvaluations.createFlyout.loadConnectorsError', {
          defaultMessage: 'Failed to load connectors: {message}',
          values: { message: String(connectorsError) },
        })
      : null);

  const hasLlmEvaluator = selectedEvaluators.some((option) => option.kind === 'llm');
  const selectedConnectorId = selectedConnectorIds[0];
  const isConnectorMissing = hasLlmEvaluator && !selectedConnectorId;
  const isNameMissing = name.trim().length === 0;
  const areEvaluatorsMissing = selectedEvaluators.length === 0;
  const isFormValid = !isNameMissing && !areEvaluatorsMissing && !isConnectorMissing;
  const isSubmitting = createOnlineEvalWorkflow.isLoading;
  const workflowHref =
    createdWorkflow && services.http
      ? services.http.basePath.prepend(`/app/workflows/${encodeURIComponent(createdWorkflow.id)}`)
      : undefined;

  const workflowYaml = React.useMemo(() => {
    if (!isFormValid) {
      return undefined;
    }

    return buildOnlineEvalWorkflowYaml({
      name: name.trim(),
      indexPattern: indexPattern.trim(),
      ...(extraEsqlWhere.trim() ? { extraEsqlWhere: extraEsqlWhere.trim() } : {}),
      windowMinutes,
      lagMinutes,
      maxTracesPerRun,
      every,
      evaluators: selectedEvaluators.map(({ name: evaluatorName, version }) => ({
        name: evaluatorName,
        version,
      })),
      connectorId: selectedConnectorId ?? '',
    });
  }, [
    every,
    extraEsqlWhere,
    indexPattern,
    isFormValid,
    lagMinutes,
    maxTracesPerRun,
    name,
    selectedConnectorId,
    selectedEvaluators,
    windowMinutes,
  ]);

  const onSaveAsWorkflow = async () => {
    setErrorMessage(null);
    if (!workflowYaml) {
      return;
    }

    try {
      const response = await createOnlineEvalWorkflow.mutateAsync({ yaml: workflowYaml });
      setCreatedWorkflow({ id: response.id, name: response.name });
    } catch (error) {
      setErrorMessage(
        i18n.translate('xpack.evals.onlineEvaluations.createFlyout.submitError', {
          defaultMessage: 'Failed to create online evaluation: {message}',
          values: { message: String(error) },
        })
      );
    }
  };

  if (createdWorkflow) {
    return (
      <>
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="s">
            <h2>
              {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.title', {
                defaultMessage: 'Create online evaluation',
              })}
            </h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiEmptyPrompt
            iconType="checkInCircleFilled"
            iconColor="success"
            title={
              <h2>
                {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.savedTitle', {
                  defaultMessage: 'Saved workflow "{name}"',
                  values: { name: createdWorkflow.name },
                })}
              </h2>
            }
            body={
              <p>
                {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.savedBody', {
                  defaultMessage:
                    'Your online evaluation is saved as a reusable workflow. Open it in Workflows to run it now, schedule it, or edit it.',
                })}
              </p>
            }
            actions={
              workflowHref
                ? [
                    <EuiButton
                      key="openWorkflow"
                      iconType="popout"
                      href={workflowHref}
                      data-test-subj="onlineEvalSavedOpenWorkflowButton"
                    >
                      {i18n.translate(
                        'xpack.evals.onlineEvaluations.createFlyout.savedOpenWorkflowButton',
                        {
                          defaultMessage: 'Open in Workflows',
                        }
                      )}
                    </EuiButton>,
                  ]
                : undefined
            }
          />
        </EuiFlyoutBody>
        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty onClick={onClose} data-test-subj="onlineEvalSavedCloseButton">
                {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.savedCloseButton', {
                  defaultMessage: 'Close',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </>
    );
  }

  return (
    <>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="s">
          <h2>
            {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.title', {
              defaultMessage: 'Create online evaluation',
            })}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        {combinedErrorMessage ? (
          <>
            <EuiCallOut
              announceOnMount
              title={i18n.translate(
                'xpack.evals.onlineEvaluations.createFlyout.errorCalloutTitle',
                {
                  defaultMessage: 'Something went wrong',
                }
              )}
              color="danger"
              iconType="error"
              size="s"
            >
              <p>{combinedErrorMessage}</p>
            </EuiCallOut>
            <EuiSpacer size="m" />
          </>
        ) : null}

        <EuiCallOut
          title={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.tracingPrereqTitle', {
            defaultMessage: 'Agent Builder tracing prerequisites',
          })}
          color="warning"
          iconType="warning"
          size="s"
        >
          <p>
            {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.tracingPrereqBody', {
              defaultMessage:
                'Groundedness scoring requires tracing enabled with experimental features and all advanced capture settings turned on: includeUserPrompts, includeLlmResponses, and includeToolDetails.',
            })}
          </p>
        </EuiCallOut>

        <EuiSpacer size="m" />

        <EuiForm component="form" id="createOnlineEvalForm">
          <EuiFormRow
            label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.nameLabel', {
              defaultMessage: 'Name',
            })}
            fullWidth
          >
            <EuiFieldText
              fullWidth
              value={name}
              onChange={(event) => setName(event.target.value)}
              data-test-subj="onlineEvalCreateNameInput"
            />
          </EuiFormRow>

          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h3>
              {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.targetAndFilterLabel', {
                defaultMessage: 'Target and filter',
              })}
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />

          <EuiFormRow
            label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.extraWhereLabel', {
              defaultMessage: 'Optional ES|QL WHERE filter',
            })}
            fullWidth
          >
            <EuiTextArea
              fullWidth
              rows={3}
              value={extraEsqlWhere}
              onChange={(event) => setExtraEsqlWhere(event.target.value)}
              data-test-subj="onlineEvalCreateExtraWhereInput"
            />
          </EuiFormRow>

          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h3>
              {i18n.translate(
                'xpack.evals.onlineEvaluations.createFlyout.evaluatorsAndJudgeLabel',
                {
                  defaultMessage: 'Evaluators and judge',
                }
              )}
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />

          <EvaluatorSelector
            label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.evaluatorsLabel', {
              defaultMessage: 'Evaluators',
            })}
            evaluators={evaluatorsData?.evaluators ?? []}
            selectedEvaluators={selectedEvaluators}
            connectorOptions={connectorOptions}
            onChange={setSelectedEvaluators}
            isEvaluatorsLoading={isLoadingEvaluators}
            showJudgeConnectorSelection={false}
            evaluatorOptionLabel={(evaluator) =>
              evaluator.version
                ? `${evaluator.name}@${evaluator.version} (${evaluator.kind})`
                : `${evaluator.name} (${evaluator.kind})`
            }
            evaluatorOptionMeta={(evaluator) => {
              const requiresReferenceData = Boolean(evaluator.reference_data_schema?.required);
              return {
                disabled: requiresReferenceData,
                toolTipContent: requiresReferenceData
                  ? i18n.translate(
                      'xpack.evals.onlineEvaluations.createFlyout.evaluatorReferenceDataRequiredTooltip',
                      {
                        defaultMessage:
                          'This evaluator requires reference data and is not supported in online evaluations yet.',
                      }
                    )
                  : undefined,
              };
            }}
            evaluatorsDataTestSubj="onlineEvalCreateEvaluatorsCombo"
            judgeConnectorDataTestSubjPrefix="onlineEvalCreateUnusedJudgeConnector"
          />

          <ConnectorSelector
            label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.connectorLabel', {
              defaultMessage: 'Connector',
            })}
            helpText={i18n.translate(
              'xpack.evals.onlineEvaluations.createFlyout.connectorHelpText',
              {
                defaultMessage: 'Required when any selected evaluator kind is llm.',
              }
            )}
            isInvalid={isConnectorMissing}
            error={
              isConnectorMissing
                ? i18n.translate(
                    'xpack.evals.onlineEvaluations.createFlyout.connectorMissingError',
                    {
                      defaultMessage: 'Connector is required for llm evaluators.',
                    }
                  )
                : undefined
            }
            selectedConnectorIds={selectedConnectorIds}
            connectorOptions={connectorOptions}
            onChange={setSelectedConnectorIds}
            isLoading={isLoadingConnectors}
            dataTestSubj="onlineEvalCreateConnectorCombo"
            singleSelection
          />

          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h3>
              {i18n.translate(
                'xpack.evals.onlineEvaluations.createFlyout.scheduleAndAdvancedLabel',
                {
                  defaultMessage: 'Schedule and advanced',
                }
              )}
            </h3>
          </EuiTitle>
          <EuiSpacer size="s" />

          <EuiFormRow
            label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.everyLabel', {
              defaultMessage: 'Schedule',
            })}
            fullWidth
          >
            <EuiSelect
              fullWidth
              options={[
                { value: '5m', text: '5m' },
                { value: '15m', text: '15m' },
                { value: '1h', text: '1h' },
                { value: '6h', text: '6h' },
                { value: '1d', text: '1d' },
              ]}
              value={every}
              onChange={(event) => setEvery(event.target.value)}
              data-test-subj="onlineEvalCreateEverySelect"
            />
          </EuiFormRow>

          <EuiSpacer size="m" />

          <EuiAccordion
            id="onlineEvalCreateAdvancedAccordion"
            buttonContent={i18n.translate(
              'xpack.evals.onlineEvaluations.createFlyout.advancedAccordionLabel',
              {
                defaultMessage: 'Advanced',
              }
            )}
            data-test-subj="onlineEvalCreateAdvancedAccordion"
          >
            <EuiSpacer size="m" />

            <EuiFormRow
              label={i18n.translate(
                'xpack.evals.onlineEvaluations.createFlyout.indexPatternLabel',
                {
                  defaultMessage: 'Source index pattern',
                }
              )}
              helpText={i18n.translate(
                'xpack.evals.onlineEvaluations.createFlyout.indexPatternHelpText',
                {
                  defaultMessage: 'TODO: switch to a space-aware Agent Builder traces default.',
                }
              )}
              fullWidth
            >
              <EuiFieldText
                fullWidth
                value={indexPattern}
                onChange={(event) => setIndexPattern(event.target.value)}
                data-test-subj="onlineEvalCreateIndexPatternInput"
              />
            </EuiFormRow>

            <EuiFormRow
              label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.windowLabel', {
                defaultMessage: 'Window (minutes)',
              })}
              fullWidth
            >
              <EuiFieldNumber
                fullWidth
                min={1}
                value={windowMinutes}
                onChange={(event) => setWindowMinutes(Number(event.target.value) || 1)}
                data-test-subj="onlineEvalCreateWindowInput"
              />
            </EuiFormRow>

            <EuiFormRow
              label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.lagLabel', {
                defaultMessage: 'Lag (minutes)',
              })}
              fullWidth
            >
              <EuiFieldNumber
                fullWidth
                min={0}
                value={lagMinutes}
                onChange={(event) => setLagMinutes(Number(event.target.value) || 0)}
                data-test-subj="onlineEvalCreateLagInput"
              />
            </EuiFormRow>

            <EuiFormRow
              label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.maxTracesLabel', {
                defaultMessage: 'Max traces per run',
              })}
              fullWidth
            >
              <EuiFieldNumber
                fullWidth
                min={1}
                value={maxTracesPerRun}
                onChange={(event) => setMaxTracesPerRun(Number(event.target.value) || 1)}
                data-test-subj="onlineEvalCreateMaxTracesInput"
              />
            </EuiFormRow>
          </EuiAccordion>

          <EuiSpacer size="m" />
          <EuiSwitch
            label={i18n.translate('xpack.evals.onlineEvaluations.createFlyout.showYamlLabel', {
              defaultMessage: 'Show workflow YAML',
            })}
            checked={showYamlPreview}
            onChange={(event) => setShowYamlPreview(event.target.checked)}
            data-test-subj="onlineEvalCreateShowYamlToggle"
          />
          {showYamlPreview && (
            <>
              <EuiSpacer size="s" />
              {isFormValid ? (
                <WorkflowYamlPreview yaml={workflowYaml} />
              ) : (
                <EuiText size="xs" color="subdued">
                  {i18n.translate(
                    'xpack.evals.onlineEvaluations.createFlyout.yamlPreviewIncompleteHint',
                    {
                      defaultMessage:
                        'Enter a name, choose at least one evaluator, and select a connector for LLM evaluators to preview the YAML.',
                    }
                  )}
                </EuiText>
              )}
            </>
          )}
        </EuiForm>
      </EuiFlyoutBody>

      <EuiFlyoutFooter>
        <EuiButtonEmpty onClick={onClose} disabled={isSubmitting}>
          {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.cancelButton', {
            defaultMessage: 'Cancel',
          })}
        </EuiButtonEmpty>
        <EuiButton
          fill
          onClick={onSaveAsWorkflow}
          isLoading={isSubmitting}
          disabled={isSubmitting || !isFormValid}
          data-test-subj="onlineEvalCreateSubmitButton"
        >
          {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.submitButton', {
            defaultMessage: 'Save as workflow',
          })}
        </EuiButton>
        {!isFormValid && (
          <EuiText size="xs" color="subdued" textAlign="right">
            <EuiSpacer size="xs" />
            {i18n.translate('xpack.evals.onlineEvaluations.createFlyout.validationHint', {
              defaultMessage:
                'Requires a name and at least one evaluator (with a connector for LLM evaluators).',
            })}
          </EuiText>
        )}
      </EuiFlyoutFooter>
    </>
  );
};
