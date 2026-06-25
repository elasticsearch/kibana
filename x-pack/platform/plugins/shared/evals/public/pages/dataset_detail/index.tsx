/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFlyoutResizable,
  EuiForm,
  EuiFormRow,
  EuiHorizontalRule,
  EuiLink,
  EuiEmptyPrompt,
  EuiLoadingSpinner,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiPageSection,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { CodeEditor } from '@kbn/code-editor';
import { isHttpFetchError } from '@kbn/core-http-browser';
import { reactRouterNavigate } from '@kbn/kibana-react-plugin/public';
import { useHistory, useParams } from 'react-router-dom';
import { TraceWaterfall, useTraceSpans } from '@kbn/llm-trace-waterfall';
import type {
  DatasetExample,
  EvaluationExperimentSummary,
  EvaluationScoreDocument,
} from '@kbn/evals-common';
import {
  useAddExamples,
  useDataset,
  useDeleteExample,
  useEvalsTraceFetcher,
  useExampleScores,
  useEvaluationExperiments,
  useUpdateDataset,
  useUpdateExample,
} from '../../hooks/use_evals_api';
import { useEvalsPermissions } from '../../hooks/use_evals_permissions';
import { DeleteDatasetModal } from '../../components/delete_dataset_modal';
import * as i18n from './translations';

type JsonObject = Record<string, unknown>;

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const compactJson = (value: unknown) => JSON.stringify(value);

const truncate = (text: string, maxLen = 80): string =>
  text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;

const parseJsonObject = (value: string, fieldLabel: string): JsonObject => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(i18n.getJsonObjectRequiredError(fieldLabel));
    }
    return parsed as JsonObject;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${i18n.JSON_PARSE_ERROR_PREFIX} ${message}`);
  }
};

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '-');

const formatScore = (score: number | null | undefined) =>
  score == null ? i18n.SCORE_NOT_AVAILABLE : score.toFixed(2);

const truncatedCellStyles = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
  cursor: pointer;
`;

export const DatasetDetailPage: React.FC = () => {
  const { datasetId } = useParams<{ datasetId: string }>();
  const history = useHistory();
  const { euiTheme } = useEuiTheme();
  const { canManage } = useEvalsPermissions();

  const { data: dataset, isLoading: isDatasetLoading, error: datasetError } = useDataset(datasetId);
  const {
    data: runsData,
    isLoading: isRunsLoading,
    error: runsError,
  } = useEvaluationExperiments({
    datasetId,
    page: 1,
    perPage: 100,
  });

  const updateDataset = useUpdateDataset();
  const addExamples = useAddExamples();
  const updateExample = useUpdateExample();
  const deleteExample = useDeleteExample();

  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [metadataDescription, setMetadataDescription] = useState('');
  const [selectedExample, setSelectedExample] = useState<DatasetExample | null>(null);
  const [isEditingExample, setIsEditingExample] = useState(false);
  const [editInput, setEditInput] = useState('');
  const [editOutput, setEditOutput] = useState('');
  const [editMetadata, setEditMetadata] = useState('');
  const [isCreateExampleOpen, setIsCreateExampleOpen] = useState(false);
  const [createInput, setCreateInput] = useState('{}');
  const [createOutput, setCreateOutput] = useState('{}');
  const [createMetadata, setCreateMetadata] = useState('{}');
  const [deletingExample, setDeletingExample] = useState<DatasetExample | null>(null);
  const [isDeleteDatasetModalOpen, setIsDeleteDatasetModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const fetchTrace = useEvalsTraceFetcher();
  const {
    spans,
    durationMs,
    isLoading: traceLoading,
    error: traceError,
  } = useTraceSpans(selectedTraceId, { fetchTrace });

  const {
    data: exampleScoresData,
    isLoading: isExampleScoresLoading,
    error: exampleScoresError,
  } = useExampleScores(selectedExample?.id ?? '');

  const openMetadataModal = () => {
    setMetadataDescription(dataset?.description ?? '');
    setFormError(null);
    setIsMetadataModalOpen(true);
  };

  const openExampleFlyout = useCallback((example: DatasetExample) => {
    setSelectedExample(example);
    setIsEditingExample(false);
    setFormError(null);
  }, []);

  const closeFlyout = useCallback(() => {
    setSelectedExample(null);
    setIsEditingExample(false);
    setFormError(null);
  }, []);

  const enterEditMode = useCallback(() => {
    if (!selectedExample) return;
    setEditInput(prettyJson(selectedExample.input ?? {}));
    setEditOutput(prettyJson(selectedExample.output ?? {}));
    setEditMetadata(prettyJson(selectedExample.metadata ?? {}));
    setFormError(null);
    setIsEditingExample(true);
  }, [selectedExample]);

  const cancelEdit = useCallback(() => {
    setIsEditingExample(false);
    setFormError(null);
  }, []);

  const openCreateExampleFlyout = useCallback(() => {
    setSelectedExample(null);
    setIsEditingExample(false);
    setIsCreateExampleOpen(true);
    setCreateInput('{}');
    setCreateOutput('{}');
    setCreateMetadata('{}');
    setFormError(null);
  }, []);

  const closeCreateFlyout = useCallback(() => {
    setIsCreateExampleOpen(false);
    setFormError(null);
  }, []);

  const closeModals = () => {
    setIsMetadataModalOpen(false);
    setDeletingExample(null);
    setFormError(null);
  };

  const onSubmitMetadata = async () => {
    if (!dataset) return;
    try {
      setFormError(null);
      await updateDataset.mutateAsync({
        datasetId: dataset.id,
        updates: { description: metadataDescription },
      });
      setIsMetadataModalOpen(false);
    } catch (error) {
      setFormError(String(error));
    }
  };

  const onSaveEditExample = async () => {
    if (!selectedExample) return;
    try {
      setFormError(null);
      const input = parseJsonObject(editInput, i18n.JSON_INPUT_LABEL);
      const output = parseJsonObject(editOutput, i18n.JSON_OUTPUT_LABEL);
      const metadata = parseJsonObject(editMetadata, i18n.JSON_METADATA_LABEL);
      await updateExample.mutateAsync({
        datasetId,
        exampleId: selectedExample.id,
        updates: { input, output, metadata },
      });
      setIsEditingExample(false);
      setSelectedExample(null);
    } catch (error) {
      setFormError(String(error));
    }
  };

  const onCreateExample = async () => {
    try {
      setFormError(null);
      const input = parseJsonObject(createInput, i18n.JSON_INPUT_LABEL);
      const output = parseJsonObject(createOutput, i18n.JSON_OUTPUT_LABEL);
      const metadata = parseJsonObject(createMetadata, i18n.JSON_METADATA_LABEL);
      await addExamples.mutateAsync({
        datasetId,
        body: { examples: [{ input, output, metadata }] },
      });
      setIsCreateExampleOpen(false);
    } catch (error) {
      setFormError(String(error));
    }
  };

  const onDeleteExample = async () => {
    if (!deletingExample) return;
    try {
      setFormError(null);
      await deleteExample.mutateAsync({
        datasetId,
        exampleId: deletingExample.id,
      });
      if (selectedExample?.id === deletingExample.id) {
        setSelectedExample(null);
        setIsEditingExample(false);
      }
      setDeletingExample(null);
    } catch (error) {
      setFormError(String(error));
    }
  };

  const filteredExamples = useMemo(() => {
    if (!dataset?.examples) return [];
    if (!searchQuery.trim()) return dataset.examples;
    const query = searchQuery.toLowerCase();
    return dataset.examples.filter((example) => {
      const inputStr = compactJson(example.input ?? {}).toLowerCase();
      const outputStr = compactJson(example.output ?? {}).toLowerCase();
      const metadataStr = compactJson(example.metadata ?? {}).toLowerCase();
      return inputStr.includes(query) || outputStr.includes(query) || metadataStr.includes(query);
    });
  }, [dataset?.examples, searchQuery]);

  const examplesColumns: Array<EuiBasicTableColumn<DatasetExample>> = useMemo(
    () => [
      {
        field: 'id',
        name: i18n.COLUMN_EXAMPLE_ID,
        width: '160px',
        render: (value: string) => (
          <EuiText size="xs" className={truncatedCellStyles}>
            {truncate(value, 16)}
          </EuiText>
        ),
      },
      {
        field: 'input',
        name: i18n.COLUMN_INPUT,
        truncateText: true,
        render: (value: unknown) => {
          if (value == null) {
            return (
              <EuiText size="xs" color="subdued">
                {'-'}
              </EuiText>
            );
          }
          const text = compactJson(value);
          return (
            <EuiToolTip content={truncate(text, 300)} position="top">
              <EuiText size="xs" color="subdued" tabIndex={0}>
                {truncate(text)}
              </EuiText>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'output',
        name: i18n.COLUMN_OUTPUT,
        truncateText: true,
        render: (value: unknown) => {
          if (value == null) {
            return (
              <EuiText size="xs" color="subdued">
                {'-'}
              </EuiText>
            );
          }
          const text = compactJson(value);
          return (
            <EuiToolTip content={truncate(text, 300)} position="top">
              <EuiText size="xs" color="subdued" tabIndex={0}>
                {truncate(text)}
              </EuiText>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'metadata',
        name: i18n.COLUMN_METADATA,
        truncateText: true,
        render: (value: unknown) => {
          if (value == null) {
            return (
              <EuiText size="xs" color="subdued">
                {'-'}
              </EuiText>
            );
          }
          const text = compactJson(value);
          return (
            <EuiToolTip content={truncate(text, 300)} position="top">
              <EuiText size="xs" color="subdued" tabIndex={0}>
                {truncate(text)}
              </EuiText>
            </EuiToolTip>
          );
        },
      },
    ],
    []
  );

  const runsColumns: Array<EuiBasicTableColumn<EvaluationExperimentSummary>> = useMemo(
    () => [
      {
        field: 'experiment_name',
        name: i18n.COLUMN_RUN_NAME,
        render: (_name: string | null | undefined, row: EvaluationExperimentSummary) => {
          const isSuiteRun = !!row.suite_id;
          const displayName = isSuiteRun
            ? row.suite_id ?? row.experiment_name ?? truncate(row.experiment_id, 12)
            : row.experiment_name ?? truncate(row.experiment_id, 12);
          const executionId = row.execution_id ?? row.experiment_id;
          const dsParam = encodeURIComponent(datasetId);
          const query = `?execution_id=${encodeURIComponent(executionId)}&dataset_id=${dsParam}`;
          const modelId = row.task_model?.id;
          return (
            <EuiToolTip content={executionId}>
              <div tabIndex={0}>
                <EuiLink
                  {...reactRouterNavigate(history, `/experiments/${row.experiment_id}${query}`)}
                >
                  {displayName}
                </EuiLink>
                {modelId ? (
                  <EuiText size="xs" color="subdued">
                    {modelId}
                  </EuiText>
                ) : null}
              </div>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'timestamp',
        name: i18n.COLUMN_RUN_TIMESTAMP,
        render: (timestamp: string) => formatDate(timestamp),
      },
      {
        field: 'evaluator_model',
        name: i18n.COLUMN_RUN_EVALUATOR_MODEL,
        render: (value: EvaluationExperimentSummary['evaluator_model']) => value?.id ?? '-',
      },
      {
        field: 'git_branch',
        name: i18n.COLUMN_RUN_BRANCH,
        render: (value: string | null | undefined) =>
          value ? <EuiBadge color="hollow">{value}</EuiBadge> : '-',
      },
      {
        field: 'total_repetitions',
        name: i18n.COLUMN_RUN_REPS,
        width: '80px',
        render: (value: number | undefined) => String(value ?? 1),
      },
    ],
    [datasetId, history]
  );

  const datesSummary = useMemo(() => {
    if (!dataset) return '';
    const parts: string[] = [];
    if (dataset.created_at) {
      parts.push(`${i18n.METADATA_CREATED_AT_LABEL} ${formatDate(dataset.created_at)}`);
    }
    if (dataset.updated_at) {
      parts.push(`${i18n.METADATA_UPDATED_AT_LABEL} ${formatDate(dataset.updated_at)}`);
    }
    return parts.join(' · ');
  }, [dataset]);

  interface ExperimentScoreRow {
    runId: string;
    experimentName?: string;
    timestamp?: string;
    taskModelId?: string;
    scores: EvaluationScoreDocument[];
    traceIds: string[];
  }

  const exampleRunRows = useMemo<ExperimentScoreRow[]>(() => {
    const groupedRuns = new Map<string, ExperimentScoreRow>();
    for (const score of exampleScoresData?.scores ?? []) {
      const existing = groupedRuns.get(score.experiment_id);
      if (!existing) {
        groupedRuns.set(score.experiment_id, {
          runId: score.experiment_id,
          experimentName: score.experiment_name,
          timestamp: score['@timestamp'],
          taskModelId: score.task.model.id,
          scores: [score],
          traceIds: score.task.trace_id ? [score.task.trace_id] : [],
        });
        continue;
      }

      existing.scores.push(score);
      if (!existing.timestamp || score['@timestamp'] > existing.timestamp) {
        existing.timestamp = score['@timestamp'];
      }
      if (!existing.taskModelId) {
        existing.taskModelId = score.task.model.id;
      }
      if (score.task.trace_id && !existing.traceIds.includes(score.task.trace_id)) {
        existing.traceIds.push(score.task.trace_id);
      }
    }

    return Array.from(groupedRuns.values()).sort((a, b) => {
      if (a.timestamp && b.timestamp) {
        return b.timestamp.localeCompare(a.timestamp);
      }
      return a.runId.localeCompare(b.runId);
    });
  }, [exampleScoresData?.scores]);

  const exampleRunColumns: Array<EuiBasicTableColumn<ExperimentScoreRow>> = useMemo(
    () => [
      {
        field: 'runId',
        name: i18n.COLUMN_RUN_NAME,
        render: (_runId: string, row: ExperimentScoreRow) => {
          const displayName = row.experimentName ?? truncate(row.runId, 12);
          return (
            <EuiToolTip content={row.runId}>
              <div tabIndex={0}>
                <EuiLink
                  {...reactRouterNavigate(
                    history,
                    `/experiments/${row.runId}?dataset_id=${encodeURIComponent(datasetId)}`
                  )}
                >
                  {displayName}
                </EuiLink>
                {row.taskModelId ? (
                  <EuiText size="xs" color="subdued">
                    {row.taskModelId}
                  </EuiText>
                ) : null}
              </div>
            </EuiToolTip>
          );
        },
      },
      {
        field: 'timestamp',
        name: i18n.COLUMN_EXPERIMENT_TIMESTAMP,
        width: '180px',
        render: (timestamp?: string) => formatDate(timestamp),
      },
      {
        field: 'scores',
        name: i18n.COLUMN_EXPERIMENT_EVALUATOR_SCORES,
        render: (scores: EvaluationScoreDocument[]) => {
          const sortedScores = [...scores].sort((a, b) => {
            const evaluatorDelta = a.evaluator.name.localeCompare(b.evaluator.name);
            if (evaluatorDelta !== 0) return evaluatorDelta;
            return a.task.repetition_index - b.task.repetition_index;
          });

          const evaluatorCounts = sortedScores.reduce<Record<string, number>>((acc, score) => {
            acc[score.evaluator.name] = (acc[score.evaluator.name] ?? 0) + 1;
            return acc;
          }, {});

          return (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {sortedScores.map((score) => {
                const includeRepetition = (evaluatorCounts[score.evaluator.name] ?? 0) > 1;
                const repetitionLabel = includeRepetition
                  ? i18n.getRepetitionLabel(score.task.repetition_index + 1)
                  : '';
                return (
                  <EuiFlexItem
                    key={[
                      score.evaluator.name,
                      score.task.repetition_index,
                      score.task.trace_id ?? 'no_trace',
                      score['@timestamp'],
                    ].join(':')}
                    grow={false}
                  >
                    <EuiBadge color="hollow">
                      {`${score.evaluator.name}${repetitionLabel}: ${formatScore(
                        score.evaluator.score
                      )}`}
                    </EuiBadge>
                  </EuiFlexItem>
                );
              })}
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'traceIds',
        name: i18n.COLUMN_EXPERIMENT_TRACE,
        width: '170px',
        render: (traceIds: string[]) =>
          traceIds.length > 0 ? (
            <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
              {traceIds.map((traceId) => (
                <EuiFlexItem key={traceId} grow={false}>
                  <EuiButtonEmpty
                    size="xs"
                    iconType="apmTrace"
                    onClick={() => setSelectedTraceId(traceId)}
                  >
                    {truncate(traceId, 12)}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          ) : (
            '-'
          ),
      },
    ],
    [datasetId, history]
  );

  if (isDatasetLoading) {
    return (
      <EuiPageSection paddingSize="none" css={{ paddingTop: euiTheme.size.l }}>
        <EuiLoadingSpinner size="xl" />
      </EuiPageSection>
    );
  }

  if (datasetError) {
    const isNotFound = isHttpFetchError(datasetError) && datasetError.response?.status === 404;
    return (
      <EuiPageSection paddingSize="none" css={{ paddingTop: euiTheme.size.l }}>
        <EuiEmptyPrompt
          color={isNotFound ? 'subdued' : 'danger'}
          iconType={isNotFound ? 'search' : 'warning'}
          title={
            <h2>{isNotFound ? i18n.DATASET_NOT_FOUND_TITLE : i18n.DATASET_LOAD_ERROR_TITLE}</h2>
          }
          body={
            <p>
              {isNotFound
                ? i18n.getDatasetNotFoundBody(datasetId)
                : i18n.getDatasetLoadErrorBody(String(datasetError))}
            </p>
          }
          actions={[
            <EuiButton onClick={() => history.push('/datasets')}>
              {i18n.BACK_TO_DATASETS}
            </EuiButton>,
          ]}
        />
      </EuiPageSection>
    );
  }

  return (
    <>
      <EuiPageSection paddingSize="none" css={{ paddingTop: euiTheme.size.l }}>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2>{i18n.getPageTitle(dataset?.name ?? datasetId)}</h2>
            </EuiTitle>
          </EuiFlexItem>
          {dataset && canManage ? (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={i18n.EDIT_DESCRIPTION_BUTTON} disableScreenReaderOutput>
                    <EuiButtonIcon
                      iconType="pencil"
                      display="base"
                      size="m"
                      onClick={openMetadataModal}
                      aria-label={i18n.EDIT_DESCRIPTION_BUTTON}
                      data-test-subj="editDatasetMetadataButton"
                    />
                  </EuiToolTip>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={i18n.DELETE_DATASET_BUTTON} disableScreenReaderOutput>
                    <EuiButtonIcon
                      iconType="trash"
                      display="base"
                      size="m"
                      color="danger"
                      onClick={() => setIsDeleteDatasetModalOpen(true)}
                      aria-label={i18n.DELETE_DATASET_BUTTON}
                      data-test-subj="deleteDatasetButton"
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
        <EuiSpacer size="l" />

        {runsError ? (
          <EuiText color="danger" size="s">
            <p>{String(runsError)}</p>
          </EuiText>
        ) : null}

        {dataset ? (
          <>
            {formError && !selectedExample && !isCreateExampleOpen ? (
              <>
                <EuiText color="danger" size="s">
                  <p>{formError}</p>
                </EuiText>
                <EuiSpacer size="s" />
              </>
            ) : null}

            {dataset.description ? (
              <>
                <EuiText size="s" color="subdued">
                  <p>{dataset.description}</p>
                </EuiText>
                <EuiSpacer size="s" />
              </>
            ) : null}
            <EuiText size="xs" color="subdued">
              <p>{datesSummary}</p>
            </EuiText>

            <EuiSpacer size="l" />

            <EuiTitle size="xs">
              <h3>{i18n.getExamplesCountTitle(dataset.examples.length)}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiFlexGroup
              gutterSize="m"
              alignItems="center"
              responsive={false}
              justifyContent="spaceBetween"
            >
              <EuiFlexItem
                className={css`
                  max-width: 500px;
                `}
              >
                <EuiFieldSearch
                  placeholder={i18n.SEARCH_EXAMPLES_PLACEHOLDER}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  isClearable
                  fullWidth
                />
              </EuiFlexItem>
              {canManage ? (
                <EuiFlexItem grow={false}>
                  <EuiButton iconType="plusInCircle" onClick={openCreateExampleFlyout} fill>
                    {i18n.ADD_EXAMPLE_BUTTON}
                  </EuiButton>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
            <EuiSpacer size="m" />
            <EuiBasicTable<DatasetExample>
              tableCaption={i18n.EXAMPLES_SECTION_TITLE}
              items={filteredExamples}
              columns={examplesColumns}
              loading={addExamples.isLoading || updateExample.isLoading || deleteExample.isLoading}
              noItemsMessage={i18n.EXAMPLES_EMPTY_MESSAGE}
              rowProps={(item) => ({
                onClick: () => openExampleFlyout(item),
                className: css`
                  cursor: pointer;
                  transition: background-color 150ms ease-in-out;
                  &:hover,
                  &:hover td,
                  &:hover .euiTableRowCell {
                    background-color: var(--euiColorLightestShade) !important;
                  }
                `,
              })}
            />

            <EuiSpacer size="l" />
            <EuiHorizontalRule />
            <EuiSpacer size="l" />

            <EuiTitle size="xs">
              <h3>{i18n.RUNS_SECTION_TITLE}</h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiBasicTable<EvaluationExperimentSummary>
              tableCaption={i18n.RUNS_SECTION_TITLE}
              items={runsData?.experiments ?? []}
              columns={runsColumns}
              loading={isRunsLoading}
              noItemsMessage={i18n.RUNS_EMPTY_MESSAGE}
            />
          </>
        ) : null}
      </EuiPageSection>

      {/* Example detail flyout (read-only / edit mode) */}
      {selectedExample ? (
        <EuiFlyoutResizable
          ownFocus
          onClose={closeFlyout}
          size="m"
          minWidth={400}
          maxWidth={800}
          aria-labelledby="exampleFlyoutTitle"
          hideCloseButton
        >
          <EuiFlyoutHeader hasBorder>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem>
                <EuiTitle size="s">
                  <h2 id="exampleFlyoutTitle">
                    {i18n.getFlyoutTitle(selectedExample.id.slice(0, 16))}
                  </h2>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                  {canManage && !isEditingExample ? (
                    <>
                      <EuiFlexItem grow={false}>
                        <EuiToolTip content={i18n.EDIT_EXAMPLE_BUTTON} disableScreenReaderOutput>
                          <EuiButtonIcon
                            iconType="pencil"
                            display="base"
                            size="m"
                            onClick={enterEditMode}
                            aria-label={i18n.EDIT_EXAMPLE_BUTTON}
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiToolTip content={i18n.DELETE_EXAMPLE_BUTTON} disableScreenReaderOutput>
                          <EuiButtonIcon
                            iconType="trash"
                            display="base"
                            size="m"
                            color="danger"
                            onClick={() => setDeletingExample(selectedExample)}
                            aria-label={i18n.DELETE_EXAMPLE_BUTTON}
                          />
                        </EuiToolTip>
                      </EuiFlexItem>
                    </>
                  ) : null}
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content={i18n.CLOSE_FLYOUT_BUTTON} disableScreenReaderOutput>
                      <EuiButtonIcon
                        iconType="cross"
                        color="text"
                        size="m"
                        onClick={closeFlyout}
                        aria-label={i18n.CLOSE_FLYOUT_BUTTON}
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            {formError && (selectedExample || isEditingExample) ? (
              <>
                <EuiText color="danger" size="s">
                  <p>{formError}</p>
                </EuiText>
                <EuiSpacer size="m" />
              </>
            ) : null}

            {isEditingExample ? (
              <EuiForm component="form">
                <EuiFormRow label={i18n.FLYOUT_INPUT_SECTION} fullWidth>
                  <CodeEditor
                    languageId="json"
                    height="200px"
                    value={editInput}
                    onChange={(value: string) => setEditInput(value)}
                    options={{
                      minimap: { enabled: false },
                      wordWrap: 'on',
                      automaticLayout: true,
                      lineNumbers: 'on',
                      tabSize: 2,
                      fontSize: 14,
                    }}
                  />
                </EuiFormRow>
                <EuiFormRow label={i18n.FLYOUT_OUTPUT_SECTION} fullWidth>
                  <CodeEditor
                    languageId="json"
                    height="260px"
                    value={editOutput}
                    onChange={(value: string) => setEditOutput(value)}
                    options={{
                      minimap: { enabled: false },
                      wordWrap: 'on',
                      automaticLayout: true,
                      lineNumbers: 'on',
                      tabSize: 2,
                      fontSize: 14,
                    }}
                  />
                </EuiFormRow>
                <EuiFormRow label={i18n.FLYOUT_METADATA_SECTION} fullWidth>
                  <CodeEditor
                    languageId="json"
                    height="140px"
                    value={editMetadata}
                    onChange={(value: string) => setEditMetadata(value)}
                    options={{
                      minimap: { enabled: false },
                      wordWrap: 'on',
                      automaticLayout: true,
                      lineNumbers: 'on',
                      tabSize: 2,
                      fontSize: 14,
                    }}
                  />
                </EuiFormRow>
              </EuiForm>
            ) : (
              <>
                <EuiAccordion
                  id="flyout-input"
                  buttonContent={i18n.FLYOUT_INPUT_SECTION}
                  initialIsOpen
                  paddingSize="m"
                >
                  <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                    {prettyJson(selectedExample.input ?? {})}
                  </EuiCodeBlock>
                </EuiAccordion>
                <EuiSpacer size="m" />
                <EuiAccordion
                  id="flyout-output"
                  buttonContent={i18n.FLYOUT_OUTPUT_SECTION}
                  initialIsOpen
                  paddingSize="m"
                >
                  <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                    {prettyJson(selectedExample.output ?? {})}
                  </EuiCodeBlock>
                </EuiAccordion>
                <EuiSpacer size="m" />
                <EuiAccordion
                  id="flyout-metadata"
                  buttonContent={i18n.FLYOUT_METADATA_SECTION}
                  initialIsOpen
                  paddingSize="m"
                >
                  <EuiCodeBlock language="json" fontSize="s" paddingSize="m" isCopyable>
                    {prettyJson(selectedExample.metadata ?? {})}
                  </EuiCodeBlock>
                </EuiAccordion>
                <EuiSpacer size="l" />
                <EuiTitle size="xxs">
                  <h4>{i18n.FLYOUT_EXPERIMENT_RUNS_SECTION}</h4>
                </EuiTitle>
                <EuiSpacer size="s" />
                {exampleScoresError ? (
                  <EuiText size="s" color="danger">
                    <p>{i18n.getExperimentRunsLoadError(String(exampleScoresError))}</p>
                  </EuiText>
                ) : (
                  <EuiBasicTable<ExperimentScoreRow>
                    tableCaption={i18n.FLYOUT_EXPERIMENT_RUNS_SECTION}
                    items={exampleRunRows}
                    columns={exampleRunColumns}
                    loading={isExampleScoresLoading}
                    noItemsMessage={i18n.FLYOUT_NO_EXPERIMENT_RUNS}
                  />
                )}
              </>
            )}
          </EuiFlyoutBody>
          {isEditingExample ? (
            <EuiFlyoutFooter>
              <EuiFlexGroup justifyContent="spaceBetween">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty onClick={cancelEdit}>{i18n.MODAL_CANCEL_BUTTON}</EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={onSaveEditExample} fill isLoading={updateExample.isLoading}>
                    {i18n.MODAL_SAVE_BUTTON}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlyoutFooter>
          ) : null}
        </EuiFlyoutResizable>
      ) : null}

      {/* Create example flyout */}
      {isCreateExampleOpen ? (
        <EuiFlyoutResizable
          ownFocus
          onClose={closeCreateFlyout}
          size="m"
          minWidth={400}
          maxWidth={800}
          aria-labelledby="createExampleFlyoutTitle"
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="s">
              <h2 id="createExampleFlyoutTitle">{i18n.ADD_EXAMPLE_MODAL_TITLE}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            {formError && isCreateExampleOpen ? (
              <>
                <EuiText color="danger" size="s">
                  <p>{formError}</p>
                </EuiText>
                <EuiSpacer size="m" />
              </>
            ) : null}
            <EuiForm component="form">
              <EuiFormRow label={i18n.FLYOUT_INPUT_SECTION} fullWidth>
                <CodeEditor
                  languageId="json"
                  height="200px"
                  value={createInput}
                  onChange={(value: string) => setCreateInput(value)}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    automaticLayout: true,
                    lineNumbers: 'on',
                    tabSize: 2,
                    fontSize: 14,
                  }}
                />
              </EuiFormRow>
              <EuiFormRow label={i18n.FLYOUT_OUTPUT_SECTION} fullWidth>
                <CodeEditor
                  languageId="json"
                  height="260px"
                  value={createOutput}
                  onChange={(value: string) => setCreateOutput(value)}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    automaticLayout: true,
                    lineNumbers: 'on',
                    tabSize: 2,
                    fontSize: 14,
                  }}
                />
              </EuiFormRow>
              <EuiFormRow label={i18n.FLYOUT_METADATA_SECTION} fullWidth>
                <CodeEditor
                  languageId="json"
                  height="140px"
                  value={createMetadata}
                  onChange={(value: string) => setCreateMetadata(value)}
                  options={{
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    automaticLayout: true,
                    lineNumbers: 'on',
                    tabSize: 2,
                    fontSize: 14,
                  }}
                />
              </EuiFormRow>
            </EuiForm>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={closeCreateFlyout}>
                  {i18n.MODAL_CANCEL_BUTTON}
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton onClick={onCreateExample} fill isLoading={addExamples.isLoading}>
                  {i18n.MODAL_SAVE_BUTTON}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyoutResizable>
      ) : null}

      {/* Edit metadata modal */}
      {isMetadataModalOpen ? (
        <EuiModal onClose={closeModals} aria-labelledby="editDescriptionModalTitle">
          <EuiModalHeader>
            <EuiModalHeaderTitle id="editDescriptionModalTitle">
              {i18n.EDIT_DESCRIPTION_MODAL_TITLE}
            </EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            {formError && isMetadataModalOpen ? (
              <>
                <EuiText color="danger" size="s">
                  <p>{formError}</p>
                </EuiText>
                <EuiSpacer size="s" />
              </>
            ) : null}
            <EuiForm component="form">
              <EuiFormRow label={i18n.METADATA_DESCRIPTION_LABEL}>
                <EuiTextArea
                  value={metadataDescription}
                  onChange={(event) => setMetadataDescription(event.target.value)}
                />
              </EuiFormRow>
            </EuiForm>
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty onClick={closeModals}>{i18n.MODAL_CANCEL_BUTTON}</EuiButtonEmpty>
            <EuiButton onClick={onSubmitMetadata} fill isLoading={updateDataset.isLoading}>
              {i18n.MODAL_SAVE_BUTTON}
            </EuiButton>
          </EuiModalFooter>
        </EuiModal>
      ) : null}

      {/* Delete dataset confirmation */}
      {isDeleteDatasetModalOpen && dataset ? (
        <DeleteDatasetModal
          datasetId={dataset.id}
          datasetName={dataset.name}
          examplesCount={dataset.examples.length}
          onClose={() => setIsDeleteDatasetModalOpen(false)}
          onDeleted={() => history.push('/datasets')}
        />
      ) : null}

      {/* Delete example confirmation */}
      {deletingExample ? (
        <EuiConfirmModal
          aria-label={i18n.CONFIRM_DELETE_EXAMPLE_TITLE}
          title={i18n.CONFIRM_DELETE_EXAMPLE_TITLE}
          onCancel={closeModals}
          onConfirm={onDeleteExample}
          cancelButtonText={i18n.MODAL_CANCEL_BUTTON}
          confirmButtonText={i18n.MODAL_DELETE_BUTTON}
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <p>{i18n.CONFIRM_DELETE_EXAMPLE_BODY}</p>
        </EuiConfirmModal>
      ) : null}

      {selectedTraceId ? (
        <EuiFlyoutResizable
          ownFocus
          onClose={() => setSelectedTraceId(null)}
          size="l"
          minWidth={480}
          maxWidth={1600}
          aria-labelledby="datasetExampleTraceWaterfallTitle"
        >
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="s">
              <h2 id="datasetExampleTraceWaterfallTitle" style={{ wordBreak: 'break-all' }}>
                {i18n.getTraceFlyoutTitle(selectedTraceId)}
              </h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody
            className={css`
              .euiFlyoutBody__overflowContent {
                height: 100%;
                padding: 0;
              }
              .euiFlyoutBody__overflow {
                overflow: hidden;
              }
            `}
          >
            <div style={{ height: '100%', padding: 16 }}>
              <TraceWaterfall
                spans={spans}
                traceId={selectedTraceId}
                durationMs={durationMs}
                isLoading={traceLoading}
                error={traceError}
              />
            </div>
          </EuiFlyoutBody>
        </EuiFlyoutResizable>
      ) : null}
    </>
  );
};
