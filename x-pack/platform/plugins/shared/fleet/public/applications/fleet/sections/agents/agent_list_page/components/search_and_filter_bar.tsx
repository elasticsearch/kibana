/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { ExperimentalFeaturesService } from '../../../../services';
import { useIsFirstTimeAgentUserQuery } from '../../../../../integrations/sections/epm/screens/detail/hooks';

import type { Agent, AgentPolicy } from '../../../../types';
import { SearchBar } from '../../../../components';
import { AGENTS_INDEX, AGENTS_PREFIX } from '../../../../constants';

import { useAuthz, useStartServices } from '../../../../hooks';

import { AgentBulkActions } from './bulk_actions';
import type { SelectionMode } from './types';
import { AgentActivityButton } from './agent_activity_button';
import { AgentStatusFilter } from './agent_status_filter';
import { DashboardsButtons } from './dashboards_buttons';
import { AgentPolicyFilter } from './filter_bar/agent_policy_filter';
import { TagsFilter } from './filter_bar/tags_filter';
import { AgentActivityBadge } from './agent_activity_badge';

export interface SearchAndFilterBarProps {
  agentPolicies: AgentPolicy[];
  draftKuery: string;
  onDraftKueryChange: (kuery: string) => void;
  onSubmitSearch: (kuery: string) => void;
  selectedAgentPolicies: string[];
  onSelectedAgentPoliciesChange: (selectedPolicies: string[]) => void;
  selectedStatus: string[];
  onSelectedStatusChange: (selectedStatus: string[]) => void;
  showUpgradeable: boolean;
  onShowUpgradeableChange: (showUpgradeable: boolean) => void;
  tags: string[];
  selectedTags: string[];
  onSelectedTagsChange: (selectedTags: string[]) => void;
  nAgentsInTable: number;
  totalInactiveAgents: number;
  totalManagedAgentIds: string[];
  selectionMode: SelectionMode;
  currentQuery: string;
  selectedAgents: Agent[];
  refreshAgents: (args?: { refreshTags?: boolean }) => void;
  onClickAddAgent: () => void;
  onClickAddFleetServer: () => void;
  onClickAddCollector: () => void;
  agentsOnCurrentPage: Agent[];
  onClickAgentActivity: () => void;
  shouldShowAgentActivityTour?: boolean;
  latestAgentActionErrors: number;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  unsupportedMigrateAgents: Agent[];
  unsupportedPrivilegeLevelChangeAgents: Agent[];
}

export const SearchAndFilterBar: React.FunctionComponent<SearchAndFilterBarProps> = ({
  agentPolicies,
  draftKuery,
  onDraftKueryChange,
  onSubmitSearch,
  selectedAgentPolicies,
  onSelectedAgentPoliciesChange,
  selectedStatus,
  onSelectedStatusChange,
  showUpgradeable,
  onShowUpgradeableChange,
  tags,
  selectedTags,
  onSelectedTagsChange,
  nAgentsInTable,
  totalInactiveAgents,
  totalManagedAgentIds,
  selectionMode,
  currentQuery,
  selectedAgents,
  refreshAgents,
  onClickAddAgent,
  onClickAddFleetServer,
  onClickAddCollector,
  agentsOnCurrentPage,
  onClickAgentActivity,
  shouldShowAgentActivityTour,
  latestAgentActionErrors,
  sortField,
  sortOrder,
  unsupportedMigrateAgents,
  unsupportedPrivilegeLevelChangeAgents,
}) => {
  const authz = useAuthz();
  const { enableOpAMP } = ExperimentalFeaturesService.get();
  const { isFirstTimeAgentUser, isLoading: isFirstTimeAgentUserLoading } =
    useIsFirstTimeAgentUserQuery();
  const { cloud } = useStartServices();
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const closeAddMenu = useCallback(() => setIsAddMenuOpen(false), []);

  const addMenuItems = useMemo(() => {
    const items = [];
    if (authz.fleet.addFleetServers && !cloud?.isServerlessEnabled) {
      items.push(
        <EuiContextMenuItem
          key="addFleetServer"
          onClick={() => {
            closeAddMenu();
            onClickAddFleetServer();
          }}
          data-test-subj="addFleetServerButton"
        >
          <FormattedMessage
            id="xpack.fleet.agentList.addFleetServerButton"
            defaultMessage="Fleet Server"
          />
        </EuiContextMenuItem>
      );
    }
    if (authz.fleet.addAgents) {
      items.push(
        <EuiContextMenuItem
          key="addAgent"
          onClick={() => {
            closeAddMenu();
            onClickAddAgent();
          }}
          data-test-subj="addAgentButton"
        >
          <FormattedMessage id="xpack.fleet.agentList.addButton" defaultMessage="Agent" />
        </EuiContextMenuItem>
      );
      items.push(
        <EuiContextMenuItem
          key="addCollector"
          onClick={() => {
            closeAddMenu();
            onClickAddCollector();
          }}
          data-test-subj="addCollectorButton"
        >
          <FormattedMessage
            id="xpack.fleet.agentList.addCollectorButton"
            defaultMessage="Collector (OpAMP)"
          />
        </EuiContextMenuItem>
      );
    }
    return items;
  }, [
    authz.fleet.addAgents,
    authz.fleet.addFleetServers,
    cloud?.isServerlessEnabled,
    closeAddMenu,
    onClickAddAgent,
    onClickAddCollector,
    onClickAddFleetServer,
  ]);

  const NO_TAGS_VALUE = i18n.translate('xpack.fleet.agentList.noTagsValue', {
    defaultMessage: 'No tags',
  });
  const tagsWithNoTagsIncluded = [...tags, NO_TAGS_VALUE];
  const hasAddOptions = addMenuItems.length > 0;
  return (
    <>
      <EuiFlexGroup direction="column">
        {/* Top Buttons and Links */}
        <EuiFlexGroup>
          <EuiFlexItem>
            {!isFirstTimeAgentUserLoading && !isFirstTimeAgentUser && <DashboardsButtons />}
          </EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="flexEnd">
            <EuiFlexItem grow={false}>
              <AgentActivityBadge
                recentErrors={latestAgentActionErrors}
                onClick={onClickAgentActivity}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <AgentActivityButton
                onClickAgentActivity={onClickAgentActivity}
                shouldShowTour={shouldShowAgentActivityTour}
              />
            </EuiFlexItem>
            {enableOpAMP ? (
              <>
                {hasAddOptions ? (
                  <EuiFlexItem grow={false}>
                    <EuiPopover
                      aria-label={i18n.translate('xpack.fleet.agentList.addMenuAriaLabel', {
                        defaultMessage: 'Add menu',
                      })}
                      anchorPosition="downRight"
                      panelPaddingSize="none"
                      button={
                        <EuiButton
                          fill
                          iconType="plusCircle"
                          iconSide="left"
                          onClick={() => setIsAddMenuOpen((open) => !open)}
                          data-test-subj="addAgentMenuButton"
                        >
                          <FormattedMessage
                            id="xpack.fleet.agentList.addMenuButton"
                            defaultMessage="Add"
                          />
                        </EuiButton>
                      }
                      isOpen={isAddMenuOpen}
                      closePopover={closeAddMenu}
                    >
                      <EuiContextMenuPanel items={addMenuItems} />
                    </EuiPopover>
                  </EuiFlexItem>
                ) : null}
              </>
            ) : (
              <>
                {authz.fleet.addFleetServers && !cloud?.isServerlessEnabled ? (
                  <EuiFlexItem grow={false}>
                    <EuiToolTip
                      content={
                        <FormattedMessage
                          id="xpack.fleet.agentList.addFleetServerButton.tooltip"
                          defaultMessage="Fleet Server is a component of the Elastic Stack used to centrally manage Elastic Agents"
                        />
                      }
                    >
                      <EuiButton
                        onClick={onClickAddFleetServer}
                        data-test-subj="addFleetServerButton"
                      >
                        <FormattedMessage
                          id="xpack.fleet.agentList.addFleetServerButton"
                          defaultMessage="Add Fleet Server"
                        />
                      </EuiButton>
                    </EuiToolTip>
                  </EuiFlexItem>
                ) : null}
                {authz.fleet.addAgents ? (
                  <>
                    <EuiFlexItem grow={false}>
                      <EuiToolTip
                        content={
                          <FormattedMessage
                            id="xpack.fleet.agentList.addAgentButton.tooltip"
                            defaultMessage="Add Elastic Agents to your hosts to collect data and send it to the Elastic Stack"
                          />
                        }
                      >
                        <EuiButton fill onClick={onClickAddAgent} data-test-subj="addAgentButton">
                          <FormattedMessage
                            id="xpack.fleet.agentList.addButton"
                            defaultMessage="Add agent"
                          />
                        </EuiButton>
                      </EuiToolTip>
                    </EuiFlexItem>
                  </>
                ) : null}
              </>
            )}
          </EuiFlexGroup>
        </EuiFlexGroup>
        {/* Search and filters */}
        <EuiFlexItem grow={4}>
          <EuiFlexGroup gutterSize="s">
            <EuiFlexItem grow={6}>
              <SearchBar
                value={draftKuery}
                fieldPrefix={AGENTS_PREFIX}
                indexPattern={AGENTS_INDEX}
                onChange={(newSearch, submit) => {
                  onDraftKueryChange(newSearch);
                  if (submit) {
                    onSubmitSearch(newSearch);
                  }
                }}
                dataTestSubj="agentList.queryInput"
              />
            </EuiFlexItem>
            <EuiFlexItem grow={2}>
              <EuiFilterGroup>
                <AgentStatusFilter
                  selectedStatus={selectedStatus}
                  onSelectedStatusChange={onSelectedStatusChange}
                  totalInactiveAgents={totalInactiveAgents}
                  disabled={agentPolicies.length === 0}
                />
                <TagsFilter
                  tags={tagsWithNoTagsIncluded}
                  selectedTags={selectedTags}
                  onSelectedTagsChange={onSelectedTagsChange}
                />
                <AgentPolicyFilter
                  selectedAgentPolicies={selectedAgentPolicies}
                  onSelectedAgentPoliciesChange={onSelectedAgentPoliciesChange}
                  agentPolicies={agentPolicies}
                />
                <EuiFilterButton
                  isToggle
                  isSelected={showUpgradeable}
                  hasActiveFilters={showUpgradeable}
                  onClick={() => {
                    onShowUpgradeableChange(!showUpgradeable);
                  }}
                  data-test-subj="agentList.showUpgradeable"
                >
                  <FormattedMessage
                    id="xpack.fleet.agentList.showUpgradeableFilterLabel"
                    defaultMessage="Upgrade available"
                  />
                </EuiFilterButton>
              </EuiFilterGroup>
            </EuiFlexItem>
            {(selectionMode === 'manual' && selectedAgents.length) ||
            (selectionMode === 'query' && nAgentsInTable > 0) ? (
              <EuiFlexItem grow={false}>
                <AgentBulkActions
                  nAgentsInTable={nAgentsInTable}
                  totalManagedAgentIds={totalManagedAgentIds}
                  selectionMode={selectionMode}
                  currentQuery={currentQuery}
                  selectedAgents={selectedAgents}
                  agentsOnCurrentPage={agentsOnCurrentPage}
                  refreshAgents={refreshAgents}
                  allTags={tags}
                  agentPolicies={agentPolicies}
                  sortField={sortField}
                  sortOrder={sortOrder}
                  unsupportedMigrateAgents={unsupportedMigrateAgents}
                  unsupportedPrivilegeLevelChangeAgents={unsupportedPrivilegeLevelChangeAgents}
                />
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
