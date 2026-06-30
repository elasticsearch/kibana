/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageHeader,
  EuiPageTemplate,
  useEuiTheme,
} from '@elastic/eui';
import React, { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { WorkflowsSearchParams } from '@kbn/workflows';
import { WORKFLOW_EXECUTION_STATS_BAR_SETTING_ID } from '@kbn/workflows/common/constants';
import {
  useShowManagedWorkflowsSetting,
  useWorkflows,
  useWorkflowsCapabilities,
} from '@kbn/workflows-ui';
import {
  parseBooleanFilterValue,
  parseWorkflowsUrlSearchParams,
  serializeWorkflowsUrlSearchParams,
} from './url_search_params';
import { PLUGIN_ID } from '../../../common';
import { useWorkflowFiltersOptions } from '../../entities/workflows/model/use_workflow_stats';
import { ImportWorkflowsFlyout } from '../../features/import_workflows/ui/import_workflows_flyout';
import { WorkflowExecutionStatsBar } from '../../features/workflow_executions_stats/ui';
import { WorkflowList } from '../../features/workflow_list';
import { useKibana } from '../../hooks/use_kibana';
import { useWorkflowsBreadcrumbs } from '../../hooks/use_workflow_breadcrumbs/use_workflow_breadcrumbs';
import { shouldShowWorkflowsEmptyState } from '../../shared/utils/workflow_utils';
import { WorkflowsFilterPopover } from '../../widgets/workflow_filter_popover/workflow_filter_popover';
import { WorkflowSearchField } from '../../widgets/workflow_search_field/ui/workflow_search_field';

const MANAGED_FILTER_OPTIONS = [
  {
    label: i18n.translate('workflows.management.managedFilter.customOptionLabel', {
      defaultMessage: 'Custom',
    }),
    key: 'unmanaged',
  },
  {
    label: i18n.translate('workflows.management.managedFilter.managedOptionLabel', {
      defaultMessage: 'Managed',
    }),
    key: 'managed',
  },
];

const getSelectedManagedFilterValues = (
  managed: WorkflowsSearchParams['managed']
): Array<'unmanaged' | 'managed'> => {
  if (managed === 'all') {
    return ['unmanaged', 'managed'];
  }

  if (managed === 'managed') {
    return ['managed'];
  }

  return ['unmanaged'];
};

const getManagedFilterValue = (
  selectedValues: Array<'unmanaged' | 'managed'>
): WorkflowsSearchParams['managed'] => {
  const selectedValuesSet = new Set(selectedValues);
  const isCustomSelected = selectedValuesSet.has('unmanaged');
  const isManagedSelected = selectedValuesSet.has('managed');

  if (isCustomSelected && isManagedSelected) {
    return 'all';
  }

  if (isManagedSelected) {
    return 'managed';
  }

  return undefined;
};

export function WorkflowsPage() {
  const { application, featureFlags } = useKibana().services;
  const isManagedWorkflowsSettingEnabled = useShowManagedWorkflowsSetting();
  const { canCreateWorkflow, canReadWorkflow, canReadManagedWorkflow, canUpdateWorkflow } =
    useWorkflowsCapabilities();
  const showManagedWorkflowsFilter = Boolean(
    isManagedWorkflowsSettingEnabled && canReadWorkflow && canReadManagedWorkflow
  );
  const { euiTheme } = useEuiTheme();
  const location = useLocation();

  const search = useMemo<WorkflowsSearchParams>(() => {
    const nextSearch = parseWorkflowsUrlSearchParams(location.search);

    if (!showManagedWorkflowsFilter) {
      const { managed, ...searchWithoutManaged } = nextSearch;
      return searchWithoutManaged;
    }

    return nextSearch;
  }, [location.search, showManagedWorkflowsFilter]);
  const { data: filtersData } = useWorkflowFiltersOptions(
    ['enabled', 'createdBy', 'tags'],
    showManagedWorkflowsFilter ? 'all' : undefined
  );

  const setSearch = useCallback(
    (newSearch: WorkflowsSearchParams) => {
      const serializedSearch = serializeWorkflowsUrlSearchParams(newSearch);
      void application.navigateToApp(PLUGIN_ID, {
        path: serializedSearch ? `?${serializedSearch}` : '',
        replace: true,
      });
    },
    [application]
  );

  const [showImportFlyout, setShowImportFlyout] = useState(false);

  const navigateToCreateWorkflow = useCallback(() => {
    application.navigateToApp(PLUGIN_ID, { path: '/create' });
  }, [application]);

  const { data: workflows } = useWorkflows(search);
  useWorkflowsBreadcrumbs();

  /** Import uses bulk APIs that require both create and update; gate UI to match server authz. */
  const canImportWorkflows = Boolean(canCreateWorkflow && canUpdateWorkflow);
  const isExecutionStatsBarEnabled = featureFlags?.getBooleanValue(
    WORKFLOW_EXECUTION_STATS_BAR_SETTING_ID,
    false
  );

  // Check if we should show empty state
  const shouldShowEmptyState = shouldShowWorkflowsEmptyState(workflows, search);
  const shouldShowFilters = !shouldShowEmptyState || showManagedWorkflowsFilter;

  return (
    <EuiPageTemplate
      offset={0}
      css={{ backgroundColor: euiTheme.colors.backgroundBasePlain }}
      data-test-subj="workflowsPage"
    >
      {/* negative margin to compensate for header's bottom padding and reduce space between header and content */}
      <EuiPageTemplate.Header
        bottomBorder={false}
        css={{ marginBottom: `-${euiTheme.size.l}` }}
        restrictWidth={false}
      >
        <EuiFlexGroup justifyContent={'spaceBetween'}>
          <EuiFlexItem>
            <EuiPageHeader
              pageTitle={
                <FormattedMessage id="workflows.pageTitle" defaultMessage="Workflows" ignoreTag />
              }
            />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s">
              {canImportWorkflows ? (
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    iconType="importAction"
                    size="m"
                    onClick={() => setShowImportFlyout(true)}
                    data-test-subj="importWorkflowsButton"
                  >
                    <FormattedMessage
                      id="workflows.importWorkflowsButton"
                      defaultMessage="Import"
                      ignoreTag
                    />
                  </EuiButtonEmpty>
                </EuiFlexItem>
              ) : null}
              {canCreateWorkflow ? (
                <EuiFlexItem grow={false}>
                  <EuiButton
                    iconType="plusInCircle"
                    color="primary"
                    size="m"
                    fill
                    onClick={navigateToCreateWorkflow}
                    data-test-subj="createWorkflowButton"
                  >
                    <FormattedMessage
                      id="workflows.createWorkflowButton"
                      defaultMessage="Create workflow"
                      ignoreTag
                    />
                  </EuiButton>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section restrictWidth={false}>
        {shouldShowFilters ? (
          <>
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
              <EuiFlexItem>
                <WorkflowSearchField
                  initialValue={search.query || ''}
                  onSearch={(query) => setSearch({ ...search, page: 1, query })}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFilterGroup>
                  <WorkflowsFilterPopover
                    filter="enabled"
                    title="Enabled"
                    values={filtersData?.enabled || []}
                    selectedValues={search.enabled || []}
                    onSelectedValuesChanged={(newValues) => {
                      const enabled = newValues
                        .map(parseBooleanFilterValue)
                        .filter((value): value is boolean => value !== undefined);

                      setSearch({
                        ...search,
                        page: 1,
                        enabled,
                      });
                    }}
                  />
                </EuiFilterGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFilterGroup>
                  <WorkflowsFilterPopover
                    filter="createdBy"
                    title="Created By"
                    values={filtersData?.createdBy || []}
                    selectedValues={search.createdBy || []}
                    onSelectedValuesChanged={(newValues) => {
                      setSearch({ ...search, page: 1, createdBy: newValues.map(String) });
                    }}
                  />
                </EuiFilterGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFilterGroup>
                  <WorkflowsFilterPopover
                    filter="tags"
                    title="Tags"
                    values={filtersData?.tags || []}
                    selectedValues={search.tags || []}
                    onSelectedValuesChanged={(newValues) => {
                      setSearch({ ...search, page: 1, tags: newValues.map(String) });
                    }}
                  />
                </EuiFilterGroup>
              </EuiFlexItem>
              {showManagedWorkflowsFilter ? (
                <EuiFlexItem grow={false}>
                  <EuiFilterGroup>
                    <WorkflowsFilterPopover
                      filter="managed"
                      title={i18n.translate('workflows.management.managedFilter.title', {
                        defaultMessage: 'View',
                      })}
                      values={MANAGED_FILTER_OPTIONS}
                      selectedValues={getSelectedManagedFilterValues(search.managed)}
                      onSelectedValuesChanged={(newValues) => {
                        const managed = getManagedFilterValue(
                          newValues as Array<'unmanaged' | 'managed'>
                        );
                        setSearch({ ...search, page: 1, managed });
                      }}
                    />
                  </EuiFilterGroup>
                </EuiFlexItem>
              ) : null}
            </EuiFlexGroup>
            {!shouldShowEmptyState && isExecutionStatsBarEnabled ? (
              <WorkflowExecutionStatsBar height={140} />
            ) : null}
          </>
        ) : null}

        <WorkflowList
          search={search}
          setSearch={setSearch}
          onCreateWorkflow={navigateToCreateWorkflow}
        />
      </EuiPageTemplate.Section>
      {showImportFlyout ? (
        <ImportWorkflowsFlyout onClose={() => setShowImportFlyout(false)} />
      ) : null}
    </EuiPageTemplate>
  );
}
