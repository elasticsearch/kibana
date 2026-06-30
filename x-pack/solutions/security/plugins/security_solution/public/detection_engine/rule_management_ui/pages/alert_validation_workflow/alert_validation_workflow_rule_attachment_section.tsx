/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiDescribedFormGroup,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  type CriteriaWithPagination,
  type EuiBasicTableColumn,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';
import { useKibana } from '../../../../common/lib/kibana';
import {
  fetchAlertValidationWorkflowRuleAttachments,
  fetchAlertValidationWorkflowRuleAttachmentSelection,
  fetchAlertValidationWorkflowRuleAttachmentStats,
  type RuleAttachmentPage,
  type RuleAttachmentSelection,
  type RuleAttachmentStats,
  type RuleAttachmentSummary,
  type UpdateRuleAttachmentsResult,
  updateAlertValidationWorkflowRuleAttachments,
} from './api';

const RULE_ATTACHMENTS_PER_PAGE = 5;

const RULE_ATTACHMENT_STATS_QUERY_KEY = [
  'alertValidationWorkflow',
  'alertValidationWorkflowRuleAttachmentStats',
] as const;

const RULE_ATTACHMENTS_QUERY_KEY = [
  'alertValidationWorkflow',
  'alertValidationWorkflowRuleAttachments',
] as const;

const RULE_ATTACHMENT_SELECTION_QUERY_KEY = [
  'alertValidationWorkflow',
  'alertValidationWorkflowRuleAttachmentSelection',
] as const;

type RuleAttachmentError = Error & { body?: { message?: string } };
type BulkSelectionAction = 'select' | 'deselect';

interface RuleAttachmentBulkSelection {
  query: string;
  attachedRuleIds: string[];
  ruleIds: string[];
}

const getErrorMessage = (error: RuleAttachmentError): string | undefined => {
  return error.body?.message ?? error.message;
};

const getShowingRulesRange = ({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}): { first: number; last: number } => {
  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return { first, last };
};

const getNextAttachedCount = ({
  attached,
  attachCount,
  detachCount,
  total,
}: {
  attached: number;
  attachCount: number;
  detachCount: number;
  total: number;
}): number => Math.min(Math.max(attached + attachCount - detachCount, 0), total);

export const AlertValidationWorkflowRuleAttachmentSection: React.FC = () => {
  const {
    services: { application, http, notifications },
  } = useKibana();
  const queryClient = useQueryClient();
  const [ruleQuery, setRuleQuery] = useState('');
  const [appliedRuleQuery, setAppliedRuleQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(RULE_ATTACHMENTS_PER_PAGE);
  const [pendingAttachRuleIds, setPendingAttachRuleIds] = useState<string[]>([]);
  const [pendingDetachRuleIds, setPendingDetachRuleIds] = useState<string[]>([]);
  const [bulkSelection, setBulkSelection] = useState<RuleAttachmentBulkSelection | null>(null);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isUpdatingRuleAttachments, setIsUpdatingRuleAttachments] = useState(false);
  const confirmModalTitleId = useGeneratedHtmlId();
  const normalizedRuleQuery = appliedRuleQuery.trim();

  // EuiBasicTable calls onSelectionChange([]) before onChange when the page/sort/size changes
  // (via its internal clearSelection). This ref captures the pending lists as of the last render
  // so onTableChange can restore them, discarding that spurious callback.
  const pendingListsRef = useRef({ attach: pendingAttachRuleIds, detach: pendingDetachRuleIds });
  pendingListsRef.current = { attach: pendingAttachRuleIds, detach: pendingDetachRuleIds };
  const canEditRules = application.capabilities.securitySolution?.crud !== false;
  const changedRulesCount = pendingAttachRuleIds.length + pendingDetachRuleIds.length;

  const showRuleAttachmentError = useCallback(
    (title: string, error: RuleAttachmentError) => {
      notifications.toasts.addDanger({
        title,
        text: getErrorMessage(error),
      });
    },
    [notifications.toasts]
  );

  const statsQuery = useQuery<RuleAttachmentStats, RuleAttachmentError>({
    queryKey: [...RULE_ATTACHMENT_STATS_QUERY_KEY, normalizedRuleQuery],
    retry: false,
    queryFn: async () => {
      return fetchAlertValidationWorkflowRuleAttachmentStats({
        http,
        search: normalizedRuleQuery,
      });
    },
    onError: (error) => {
      showRuleAttachmentError(
        i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentStatsErrorMessage',
          {
            defaultMessage: 'Failed to preview matching detection rules',
          }
        ),
        error
      );
    },
  });

  const ruleAttachmentsQuery = useQuery<RuleAttachmentPage, RuleAttachmentError>({
    queryKey: [...RULE_ATTACHMENTS_QUERY_KEY, normalizedRuleQuery, page, perPage],
    enabled: statsQuery.isSuccess,
    keepPreviousData: true,
    retry: false,
    queryFn: async () => {
      return fetchAlertValidationWorkflowRuleAttachments({
        http,
        search: normalizedRuleQuery,
        page,
        perPage,
      });
    },
    onError: (error) => {
      showRuleAttachmentError(
        i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentListErrorMessage',
          {
            defaultMessage: 'Failed to load matching detection rules',
          }
        ),
        error
      );
    },
  });

  const bulkSelectionMutation = useMutation<
    RuleAttachmentSelection,
    RuleAttachmentError,
    BulkSelectionAction
  >({
    mutationKey: [...RULE_ATTACHMENT_SELECTION_QUERY_KEY, normalizedRuleQuery],
    mutationFn: async () => {
      return fetchAlertValidationWorkflowRuleAttachmentSelection({
        http,
        search: normalizedRuleQuery,
      });
    },
    onSuccess: ({ attachedRuleIds, ruleIds }, action) => {
      const matchingRuleIds = [...attachedRuleIds, ...ruleIds];
      setBulkSelection({ query: normalizedRuleQuery, attachedRuleIds, ruleIds });

      if (action === 'select') {
        setPendingAttachRuleIds((currentRuleIds) => [...new Set([...currentRuleIds, ...ruleIds])]);
        setPendingDetachRuleIds((currentRuleIds) =>
          currentRuleIds.filter((ruleId) => !matchingRuleIds.includes(ruleId))
        );
      } else {
        setPendingAttachRuleIds((currentRuleIds) =>
          currentRuleIds.filter((ruleId) => !matchingRuleIds.includes(ruleId))
        );
        setPendingDetachRuleIds((currentRuleIds) => [
          ...new Set([...currentRuleIds, ...attachedRuleIds]),
        ]);
      }
    },
    onError: (error) => {
      showRuleAttachmentError(
        i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentSelectionErrorMessage',
          {
            defaultMessage: 'Failed to select matching detection rules',
          }
        ),
        error
      );
    },
  });

  const updateMutation = useMutation<UpdateRuleAttachmentsResult, RuleAttachmentError>({
    mutationFn: async () => {
      return updateAlertValidationWorkflowRuleAttachments({
        http,
        attachRuleIds: pendingAttachRuleIds,
        detachRuleIds: pendingDetachRuleIds,
      });
    },
    onSuccess: (response: UpdateRuleAttachmentsResult) => {
      const pendingAttachRuleIdsSetForCache = new Set(pendingAttachRuleIds);
      const pendingDetachRuleIdsSetForCache = new Set(pendingDetachRuleIds);

      queryClient.setQueryData<RuleAttachmentStats>(
        [...RULE_ATTACHMENT_STATS_QUERY_KEY, normalizedRuleQuery],
        (currentStats) =>
          currentStats
            ? {
                ...currentStats,
                attached: getNextAttachedCount({
                  attached: currentStats.attached,
                  attachCount: pendingAttachRuleIds.length,
                  detachCount: pendingDetachRuleIds.length,
                  total: currentStats.total,
                }),
              }
            : currentStats
      );
      queryClient.setQueriesData<RuleAttachmentPage>(
        [...RULE_ATTACHMENTS_QUERY_KEY, normalizedRuleQuery],
        (currentPage) =>
          currentPage
            ? {
                ...currentPage,
                attached: getNextAttachedCount({
                  attached: currentPage.attached,
                  attachCount: pendingAttachRuleIds.length,
                  detachCount: pendingDetachRuleIds.length,
                  total: currentPage.total,
                }),
                rules: currentPage.rules.map((rule) => {
                  if (pendingAttachRuleIdsSetForCache.has(rule.id)) {
                    return { ...rule, attached: true };
                  }

                  if (pendingDetachRuleIdsSetForCache.has(rule.id)) {
                    return { ...rule, attached: false };
                  }

                  return rule;
                }),
              }
            : currentPage
      );
      queryClient.setQueriesData<RuleAttachmentSelection>(
        [...RULE_ATTACHMENT_SELECTION_QUERY_KEY, normalizedRuleQuery],
        (currentSelection) =>
          currentSelection
            ? {
                ...currentSelection,
                attached: getNextAttachedCount({
                  attached: currentSelection.attached,
                  attachCount: pendingAttachRuleIds.length,
                  detachCount: pendingDetachRuleIds.length,
                  total: currentSelection.total,
                }),
                selectable: getNextAttachedCount({
                  attached: currentSelection.selectable,
                  attachCount: pendingDetachRuleIds.length,
                  detachCount: pendingAttachRuleIds.length,
                  total: currentSelection.total,
                }),
                attachedRuleIds: [
                  ...new Set([
                    ...currentSelection.attachedRuleIds.filter(
                      (ruleId) => !pendingDetachRuleIdsSetForCache.has(ruleId)
                    ),
                    ...pendingAttachRuleIds,
                  ]),
                ],
                ruleIds: [
                  ...new Set([
                    ...currentSelection.ruleIds.filter(
                      (ruleId) => !pendingAttachRuleIdsSetForCache.has(ruleId)
                    ),
                    ...pendingDetachRuleIds,
                  ]),
                ],
              }
            : currentSelection
      );

      setIsConfirmModalVisible(false);
      setPendingAttachRuleIds([]);
      setPendingDetachRuleIds([]);
      setBulkSelection(null);
      queryClient.invalidateQueries({ queryKey: RULE_ATTACHMENT_STATS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: RULE_ATTACHMENTS_QUERY_KEY });
      notifications.toasts.addSuccess(
        i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentSuccessMessage',
          {
            defaultMessage:
              'Updated alert analysis workflow on {updated, plural, one {# rule} other {# rules}}.',
            values: { updated: response.updated },
          }
        )
      );
    },
    onError: (error) => {
      showRuleAttachmentError(
        i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentErrorMessage',
          {
            defaultMessage: 'Failed to update alert analysis workflow on detection rules',
          }
        ),
        error
      );
    },
    onSettled: () => {
      setIsUpdatingRuleAttachments(false);
    },
  });

  const hasRuleAttachmentError = statsQuery.isError || ruleAttachmentsQuery.isError;
  const stats = hasRuleAttachmentError ? undefined : statsQuery.data ?? ruleAttachmentsQuery.data;
  const totalRules = stats?.total ?? 0;
  const attachedRules = stats?.attached ?? 0;
  const selectableRules = Math.max(totalRules - attachedRules, 0);
  const isLoadingPreview =
    !hasRuleAttachmentError && (statsQuery.isLoading || ruleAttachmentsQuery.isFetching);
  const pageRules = useMemo(
    () => (hasRuleAttachmentError ? [] : ruleAttachmentsQuery.data?.rules ?? []),
    [hasRuleAttachmentError, ruleAttachmentsQuery.data?.rules]
  );
  const pendingAttachRuleIdsSet = useMemo(
    () => new Set(pendingAttachRuleIds),
    [pendingAttachRuleIds]
  );
  const pendingDetachRuleIdsSet = useMemo(
    () => new Set(pendingDetachRuleIds),
    [pendingDetachRuleIds]
  );
  const getRuleDesiredAttached = useCallback(
    ({ attached, id }: Pick<RuleAttachmentSummary, 'attached' | 'id'>) =>
      pendingAttachRuleIdsSet.has(id) ? true : pendingDetachRuleIdsSet.has(id) ? false : attached,
    [pendingAttachRuleIdsSet, pendingDetachRuleIdsSet]
  );
  const selectedPageRules = useMemo(
    () => pageRules.filter((rule) => getRuleDesiredAttached(rule)),
    [getRuleDesiredAttached, pageRules]
  );
  const isCurrentBulkSelectionAllSelected = useMemo(() => {
    if (!bulkSelection || bulkSelection.query !== normalizedRuleQuery) {
      return false;
    }

    return (
      bulkSelection.ruleIds.every((ruleId) => pendingAttachRuleIdsSet.has(ruleId)) &&
      bulkSelection.attachedRuleIds.every((ruleId) => !pendingDetachRuleIdsSet.has(ruleId))
    );
  }, [bulkSelection, normalizedRuleQuery, pendingAttachRuleIdsSet, pendingDetachRuleIdsSet]);
  const isCurrentPageAllSelected = useMemo(
    () =>
      totalRules > 0 &&
      totalRules === pageRules.length &&
      pageRules.every((rule) => getRuleDesiredAttached(rule)),
    [getRuleDesiredAttached, pageRules, totalRules]
  );
  const isAllMatchingRulesSelected =
    isCurrentBulkSelectionAllSelected ||
    isCurrentPageAllSelected ||
    (totalRules > 0 && attachedRules === totalRules && pendingDetachRuleIds.length === 0);
  const bulkSelectionButtonAction: BulkSelectionAction = isAllMatchingRulesSelected
    ? 'deselect'
    : 'select';
  const bulkSelectionButtonDisabled =
    !canEditRules ||
    totalRules === 0 ||
    statsQuery.isLoading ||
    hasRuleAttachmentError ||
    (!isAllMatchingRulesSelected && selectableRules === 0 && pendingDetachRuleIds.length === 0);
  const { first: firstRuleOnPage, last: lastRuleOnPage } = getShowingRulesRange({
    page,
    perPage,
    total: totalRules,
  });

  const columns: Array<EuiBasicTableColumn<RuleAttachmentSummary>> = useMemo(
    () => [
      {
        field: 'name',
        name: i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentRuleNameColumnLabel',
          {
            defaultMessage: 'Rule',
          }
        ),
        render: (name: string) => <EuiText size="s">{name}</EuiText>,
      },
      {
        field: 'enabled',
        name: i18n.translate(
          'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentEnabledColumnLabel',
          {
            defaultMessage: 'Rule state',
          }
        ),
        width: '120px',
        render: (enabled: boolean) =>
          enabled ? (
            <EuiBadge color="success">
              <FormattedMessage
                id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentEnabledBadgeLabel"
                defaultMessage="Enabled"
              />
            </EuiBadge>
          ) : (
            <EuiBadge color="hollow">
              <FormattedMessage
                id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentDisabledBadgeLabel"
                defaultMessage="Disabled"
              />
            </EuiBadge>
          ),
      },
    ],
    []
  );

  const onTableChange = useCallback(
    ({ page: tablePage }: CriteriaWithPagination<RuleAttachmentSummary>) => {
      if (tablePage) {
        // EuiBasicTable.onPageChange calls clearSelection() → onSelectionChange([]) before
        // calling onChange, so by the time we get here the pending lists have been corrupted.
        // Restore them from the ref, which holds their values as of the last render.
        setPendingAttachRuleIds(pendingListsRef.current.attach);
        setPendingDetachRuleIds(pendingListsRef.current.detach);
        setPage(tablePage.index + 1);
        setPerPage(tablePage.size);
      }
    },
    []
  );

  const applyRuleQuery = useCallback((query: string) => {
    setAppliedRuleQuery(query.trim());
    setBulkSelection(null);
    setPage(1);
  }, []);

  const onRuleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextQuery = event.target.value;
      setRuleQuery(nextQuery);

      if (nextQuery.trim() === '') {
        applyRuleQuery('');
      }
    },
    [applyRuleQuery]
  );

  const onRuleQueryKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        applyRuleQuery(event.currentTarget.value);
      }
    },
    [applyRuleQuery]
  );

  return (
    <EuiDescribedFormGroup
      fullWidth
      title={
        <h4>
          <FormattedMessage
            id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentTitle"
            defaultMessage="Detection rules"
          />
        </h4>
      }
      description={
        <p>
          <FormattedMessage
            id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentDescription"
            defaultMessage="Select the detection rules that should run the managed alert analysis workflow. Existing workflow attachments are shown before you apply changes."
          />
        </p>
      }
    >
      <EuiFlexGroup direction="column" gutterSize="m">
        <EuiFlexItem>
          <EuiFormRow
            fullWidth
            label={i18n.translate(
              'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentFilterQueryLabel',
              {
                defaultMessage: 'Rule filter',
              }
            )}
            helpText={i18n.translate(
              'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentFilterQueryHelpText',
              {
                defaultMessage:
                  'Search by rule name. Press Enter to apply. Leave empty to show every rule.',
              }
            )}
          >
            <EuiFieldSearch
              fullWidth
              data-test-subj="alertValidationWorkflowRuleAttachmentQuery"
              value={ruleQuery}
              placeholder={i18n.translate(
                'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentFilterQueryPlaceholder',
                {
                  defaultMessage: 'Search by rule name',
                }
              )}
              onChange={onRuleQueryChange}
              onKeyDown={onRuleQueryKeyDown}
              onSearch={applyRuleQuery}
              isClearable
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup
            alignItems="center"
            gutterSize="s"
            justifyContent="spaceBetween"
            responsive={false}
            wrap
          >
            <EuiFlexItem grow>
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiText
                    color="subdued"
                    size="s"
                    data-test-subj="alertValidationWorkflowRuleAttachmentShowingRules"
                  >
                    <FormattedMessage
                      id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentShowingRulesLabel"
                      defaultMessage="Showing {firstRuleOnPage}-{lastRuleOnPage} of {totalRules} rules"
                      values={{ firstRuleOnPage, lastRuleOnPage, totalRules }}
                    />
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText
                    color="subdued"
                    size="s"
                    data-test-subj="alertValidationWorkflowRuleAttachmentSelectedRules"
                  >
                    <FormattedMessage
                      id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentSelectedRulesLabel"
                      defaultMessage="Changed {changedRulesCount, plural, one {# rule} other {# rules}}"
                      values={{ changedRulesCount }}
                    />
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="alertValidationWorkflowRuleAttachmentSelectAllButton"
                    disabled={bulkSelectionButtonDisabled}
                    iconType="pagesSelect"
                    isLoading={bulkSelectionMutation.isLoading}
                    onClick={() => bulkSelectionMutation.mutate(bulkSelectionButtonAction)}
                    size="s"
                  >
                    {bulkSelectionButtonAction === 'select' ? (
                      <FormattedMessage
                        id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentSelectAllButtonLabel"
                        defaultMessage="Select all {selectableRules, plural, one {# rule} other {# rules}}"
                        values={{ selectableRules }}
                      />
                    ) : (
                      <FormattedMessage
                        id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentDeselectAllButtonLabel"
                        defaultMessage="Deselect all"
                      />
                    )}
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    data-test-subj="alertValidationWorkflowRuleAttachmentClearSelectionButton"
                    disabled={changedRulesCount === 0}
                    iconType="cross"
                    onClick={() => {
                      setPendingAttachRuleIds([]);
                      setPendingDetachRuleIds([]);
                      setBulkSelection(null);
                    }}
                    size="s"
                  >
                    <FormattedMessage
                      id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentClearSelectionButtonLabel"
                      defaultMessage="Reset changes"
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                data-test-subj="alertValidationWorkflowRuleAttachmentAttachButton"
                disabled={!canEditRules || changedRulesCount === 0}
                isLoading={updateMutation.isLoading}
                onClick={() => setIsConfirmModalVisible(true)}
                size="s"
              >
                <FormattedMessage
                  id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentAttachButtonLabel"
                  defaultMessage="Update {changedRulesCount, plural, one {# rule} other {# rules}}"
                  values={{ changedRulesCount }}
                />
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiHorizontalRule margin="s" />
          <EuiBasicTable
            compressed
            data-test-subj="alertValidationWorkflowRuleAttachmentTable"
            itemId="id"
            items={pageRules}
            columns={columns}
            loading={isLoadingPreview}
            onChange={onTableChange}
            pagination={{
              pageIndex: page - 1,
              pageSize: perPage,
              pageSizeOptions: [5, 10, 20],
              totalItemCount: hasRuleAttachmentError
                ? 0
                : ruleAttachmentsQuery.data?.total ?? totalRules,
            }}
            tableCaption={i18n.translate(
              'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentTableCaption',
              {
                defaultMessage: 'Detection rules matching the alert analysis workflow filter',
              }
            )}
            selection={{
              selectable: () => canEditRules,
              onSelectionChange: (selectedRules: RuleAttachmentSummary[]) => {
                const selectedPageRuleIds = new Set(selectedRules.map(({ id }) => id));
                const nextPendingAttachRuleIds = new Set(pendingAttachRuleIds);
                const nextPendingDetachRuleIds = new Set(pendingDetachRuleIds);

                pageRules.forEach(({ attached, id }) => {
                  const shouldAttach = selectedPageRuleIds.has(id);

                  if (shouldAttach === attached) {
                    nextPendingAttachRuleIds.delete(id);
                    nextPendingDetachRuleIds.delete(id);
                  } else if (shouldAttach) {
                    nextPendingAttachRuleIds.add(id);
                    nextPendingDetachRuleIds.delete(id);
                  } else {
                    nextPendingAttachRuleIds.delete(id);
                    nextPendingDetachRuleIds.add(id);
                  }
                });

                setPendingAttachRuleIds([...nextPendingAttachRuleIds]);
                setPendingDetachRuleIds([...nextPendingDetachRuleIds]);
              },
              selected: selectedPageRules,
            }}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      {isConfirmModalVisible && (
        <EuiConfirmModal
          data-test-subj="alertValidationWorkflowRuleAttachmentConfirmModal"
          aria-labelledby={confirmModalTitleId}
          title={i18n.translate(
            'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentConfirmModalTitle',
            {
              defaultMessage: 'Update rule attachments?',
            }
          )}
          titleProps={{ id: confirmModalTitleId }}
          onCancel={() => {
            if (!isUpdatingRuleAttachments) {
              setIsConfirmModalVisible(false);
            }
          }}
          onConfirm={() => {
            setIsUpdatingRuleAttachments(true);
            updateMutation.mutate();
          }}
          cancelButtonText={i18n.translate(
            'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentConfirmModalCancelButtonLabel',
            {
              defaultMessage: 'Cancel',
            }
          )}
          confirmButtonText={i18n.translate(
            'xpack.securitySolution.alertValidationWorkflow.ruleAttachmentConfirmModalConfirmButtonLabel',
            {
              defaultMessage: 'Update {changedRulesCount, plural, one {# rule} other {# rules}}',
              values: { changedRulesCount },
            }
          )}
          buttonColor="primary"
          defaultFocusedButton="confirm"
          confirmButtonDisabled={isUpdatingRuleAttachments}
          isLoading={isUpdatingRuleAttachments}
        >
          <EuiText size="s">
            <p>
              <FormattedMessage
                id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentConfirmModalDescription"
                defaultMessage="This will update the alert analysis workflow attachment state for {changedRulesCount, plural, one {# rule} other {# rules}}."
                values={{ changedRulesCount }}
              />
            </p>
            {isUpdatingRuleAttachments && (
              <EuiFlexGroup
                alignItems="center"
                gutterSize="s"
                responsive={false}
                data-test-subj="alertValidationWorkflowRuleAttachmentUpdatingIndicator"
              >
                <EuiFlexItem grow={false}>
                  <EuiLoadingSpinner size="l" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <FormattedMessage
                    id="xpack.securitySolution.alertValidationWorkflow.ruleAttachmentConfirmModalLoadingLabel"
                    defaultMessage="Updating rule attachments..."
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            )}
          </EuiText>
        </EuiConfirmModal>
      )}
      <EuiSpacer size="s" />
    </EuiDescribedFormGroup>
  );
};
