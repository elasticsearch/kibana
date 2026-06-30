/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiConfirmModal,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  useGeneratedHtmlId,
  type CriteriaWithPagination,
  type DefaultItemAction,
  type EuiBasicTableColumn,
} from '@elastic/eui';
import { useQuery, useMutation, useQueryClient } from '@kbn/react-query';
import { useDebouncedValue } from '@kbn/react-hooks';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { FindRulesResponse, RuleResponse } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '../../../../common/lib/kibana';
import { FormattedRelativePreferenceDate } from '../../../../common/components/formatted_date';
import { PopoverItems } from '../../../../common/components/popover_items';
import { useBoolState } from '../../../../common/hooks/use_bool_state';

const SEARCH_DEBOUNCE_MS = 300;
const DEFAULT_PER_PAGE = 10;
const SIEM_OWNER_FILTER = 'metadata.owner: siem';
const QUERY_KEY = 'v2RulesSectionList';

const SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.title',
  { defaultMessage: 'V2 Rules' }
);

const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.searchPlaceholder',
  { defaultMessage: 'Search v2 rules' }
);

const EDIT_ACTION = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.editAction',
  { defaultMessage: 'Edit rule' }
);

const DELETE_ACTION = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.deleteAction',
  { defaultMessage: 'Delete rule' }
);

const DELETE_CONFIRM_TITLE = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.deleteConfirmTitle',
  { defaultMessage: 'Delete v2 rule?' }
);

const DELETE_CONFIRM_BODY = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.deleteConfirmBody',
  { defaultMessage: 'This action cannot be undone.' }
);

const DELETE_CONFIRM_BUTTON = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.deleteConfirmButton',
  { defaultMessage: 'Delete' }
);

const CANCEL = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.cancel',
  { defaultMessage: 'Cancel' }
);

const ENABLE_RULE = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.enableRule',
  { defaultMessage: 'Enable rule' }
);

const DISABLE_RULE = i18n.translate(
  'xpack.securitySolution.ruleManagement.v2RulesSection.disableRule',
  { defaultMessage: 'Disable rule' }
);

export const V2RulesSection = () => {
  const { http, notifications, application } = useKibana().services;
  const queryClient = useQueryClient();
  const accordionId = useGeneratedHtmlId({ prefix: 'v2RulesSection' });

  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput.trim(), SEARCH_DEBOUNCE_MS);

  const [isDeleteModalVisible, showDeleteModal, hideDeleteModal] = useBoolState();
  const [ruleToDelete, setRuleToDelete] = useState<RuleResponse | null>(null);

  const { data, isLoading } = useQuery(
    [QUERY_KEY, page, perPage, debouncedSearch],
    () =>
      http.get<FindRulesResponse>(ALERTING_V2_RULE_API_PATH, {
        query: {
          page: page + 1,
          perPage,
          filter: SIEM_OWNER_FILTER,
          search: debouncedSearch || undefined,
          sortField: 'name',
          sortOrder: 'asc',
        },
      }),
    { keepPreviousData: true }
  );

  const toggleEnabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      http.patch(`${ALERTING_V2_RULE_API_PATH}/${encodeURIComponent(id)}`, {
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (_data, variables) => {
      notifications.toasts.addSuccess(
        variables.enabled
          ? i18n.translate(
              'xpack.securitySolution.ruleManagement.v2RulesSection.ruleEnabled',
              { defaultMessage: 'Rule enabled' }
            )
          : i18n.translate(
              'xpack.securitySolution.ruleManagement.v2RulesSection.ruleDisabled',
              { defaultMessage: 'Rule disabled' }
            )
      );
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: () => {
      notifications.toasts.addDanger(
        i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.toggleError',
          { defaultMessage: 'Failed to update rule status' }
        )
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      http.delete(`${ALERTING_V2_RULE_API_PATH}/${encodeURIComponent(id)}`),
    onSuccess: () => {
      notifications.toasts.addSuccess(
        i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.ruleDeleted',
          { defaultMessage: 'Rule deleted' }
        )
      );
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: () => {
      notifications.toasts.addDanger(
        i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.deleteError',
          { defaultMessage: 'Failed to delete rule' }
        )
      );
    },
  });

  const navigateToV2Rule = useCallback(
    (path: string) => {
      const url = http.basePath.prepend(`/app/security${path}`);
      application.navigateToUrl(url);
    },
    [http.basePath, application]
  );

  const onTableChange = useCallback(
    ({ page: tablePage }: CriteriaWithPagination<RuleResponse>) => {
      if (tablePage) {
        setPage(tablePage.index);
        setPerPage(tablePage.size);
      }
    },
    []
  );

  const handleDeleteConfirm = useCallback(() => {
    if (ruleToDelete) {
      deleteMutation.mutate(ruleToDelete.id);
    }
    hideDeleteModal();
    setRuleToDelete(null);
  }, [ruleToDelete, deleteMutation, hideDeleteModal]);

  const handleDeleteCancel = useCallback(() => {
    hideDeleteModal();
    setRuleToDelete(null);
  }, [hideDeleteModal]);

  const actions = useMemo<Array<DefaultItemAction<RuleResponse>>>(
    () => [
      {
        type: 'icon',
        'data-test-subj': 'v2EditRuleAction',
        description: EDIT_ACTION,
        icon: 'controls',
        name: EDIT_ACTION,
        onClick: (rule) => navigateToV2Rule(`/rules_v2/edit/${rule.id}`),
      },
      {
        type: 'icon',
        'data-test-subj': 'v2DeleteRuleAction',
        description: DELETE_ACTION,
        icon: 'trash',
        name: DELETE_ACTION,
        onClick: (rule) => {
          setRuleToDelete(rule);
          showDeleteModal();
        },
      },
    ],
    [navigateToV2Rule, showDeleteModal]
  );

  const columns = useMemo<Array<EuiBasicTableColumn<RuleResponse>>>(
    () => [
      {
        field: 'metadata.name',
        name: i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.columns.name',
          { defaultMessage: 'Rule' }
        ),
        sortable: true,
        truncateText: true,
        width: '30%',
        render: (name: string, rule: RuleResponse) => (
          <EuiLink
            onClick={() => navigateToV2Rule(`/rules_v2/view/${rule.id}`)}
            data-test-subj={`v2RuleLink-${rule.id}`}
          >
            {name}
          </EuiLink>
        ),
      },
      {
        field: 'enabled',
        name: i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.columns.enabled',
          { defaultMessage: 'Enabled' }
        ),
        width: '90px',
        render: (enabled: boolean, rule: RuleResponse) => (
          <EuiSwitch
            label={enabled ? DISABLE_RULE : ENABLE_RULE}
            showLabel={false}
            checked={enabled}
            onChange={() =>
              toggleEnabledMutation.mutate({ id: rule.id, enabled: !enabled })
            }
            compressed
            data-test-subj={`v2RuleSwitch-${rule.id}`}
          />
        ),
      },
      {
        field: 'metadata.tags',
        name: i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.columns.tags',
          { defaultMessage: 'Tags' }
        ),
        align: 'center',
        render: (tags: string[] | undefined) => {
          if (!tags?.length) {
            return null;
          }
          return (
            <PopoverItems
              items={tags}
              popoverTitle={i18n.translate(
                'xpack.securitySolution.ruleManagement.v2RulesSection.columns.tags',
                { defaultMessage: 'Tags' }
              )}
              popoverButtonTitle={tags.length.toString()}
              popoverButtonIcon="tag"
              dataTestPrefix="v2RuleTags"
              renderItem={(tag: string, idx: number) => (
                <EuiBadge color="hollow" key={`${tag}-${idx}`}>
                  {tag}
                </EuiBadge>
              )}
            />
          );
        },
        width: '65px',
      },
      {
        field: 'schedule.every',
        name: i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.columns.schedule',
          { defaultMessage: 'Interval' }
        ),
        width: '100px',
      },
      {
        field: 'updatedAt',
        name: i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.columns.updatedAt',
          { defaultMessage: 'Last updated' }
        ),
        width: '160px',
        render: (value: string) => (
          <FormattedRelativePreferenceDate value={value} />
        ),
      },
      {
        name: i18n.translate(
          'xpack.securitySolution.ruleManagement.v2RulesSection.columns.actions',
          { defaultMessage: 'Actions' }
        ),
        actions,
        width: '80px',
      },
    ],
    [navigateToV2Rule, toggleEnabledMutation, actions]
  );

  const pagination = useMemo(
    () => ({
      pageIndex: page,
      pageSize: perPage,
      totalItemCount: data?.total ?? 0,
      pageSizeOptions: [5, 10, 20],
    }),
    [page, perPage, data?.total]
  );

  const total = data?.total ?? 0;

  if (total === 0 && !isLoading && !debouncedSearch) {
    return null;
  }

  const buttonContent = (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiText size="s">
          <strong>{SECTION_TITLE}</strong>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge color="hollow">{total}</EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

  return (
    <>
      <EuiAccordion
        id={accordionId}
        buttonContent={buttonContent}
        initialIsOpen={false}
        paddingSize="m"
        data-test-subj="v2RulesSection"
      >
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem>
            <EuiFieldSearch
              fullWidth
              isClearable
              value={searchInput}
              placeholder={SEARCH_PLACEHOLDER}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(0);
              }}
              data-test-subj="v2RulesSectionSearch"
            />
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        <EuiBasicTable<RuleResponse>
          items={data?.items ?? []}
          columns={columns}
          pagination={pagination}
          onChange={onTableChange}
          loading={isLoading}
          data-test-subj="v2RulesSectionTable"
          noItemsMessage={
            <FormattedMessage
              id="xpack.securitySolution.ruleManagement.v2RulesSection.noRules"
              defaultMessage="No v2 rules found"
            />
          }
        />
      </EuiAccordion>

      <EuiSpacer size="l" />

      {isDeleteModalVisible && ruleToDelete && (
        <EuiConfirmModal
          title={DELETE_CONFIRM_TITLE}
          onCancel={handleDeleteCancel}
          onConfirm={handleDeleteConfirm}
          cancelButtonText={CANCEL}
          confirmButtonText={DELETE_CONFIRM_BUTTON}
          buttonColor="danger"
          defaultFocusedButton="confirm"
          data-test-subj="v2DeleteRuleConfirmModal"
        >
          <p>
            {ruleToDelete.metadata.name}
          </p>
          <p>
            {DELETE_CONFIRM_BODY}
          </p>
        </EuiConfirmModal>
      )}
    </>
  );
};
