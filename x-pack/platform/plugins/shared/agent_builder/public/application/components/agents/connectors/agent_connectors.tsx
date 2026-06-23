/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useEffect, useMemo, useState } from 'react';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useCanUpdateAgent } from '../../../hooks/agents/use_can_update_agent';
import { useAgentConnectors } from '../../../hooks/connectors/use_agent_connectors';
import { useConnectorsActions } from '../../../context/connectors_provider';
import { useKibana } from '../../../hooks/use_kibana';
import { useHasConnectorsAllPrivileges } from '../../../hooks/use_has_connectors_all_privileges';
import { useFlyoutState } from '../../../hooks/use_flyout_state';
import { useQueryState } from '../../../hooks/use_query_state';
import { searchParamNames } from '../../../search_param_names';
import { labels } from '../../../utils/i18n';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { PageWrapper } from '../common/page_wrapper';
import { useListDetailPageStyles } from '../common/styles';
import { ActiveConnectorRow } from './active_connector_row';
import { ConnectorDetailPanel } from './connector_detail_panel';
import { ConnectorLibraryPanel } from './connector_library_panel';
import { ConnectorsCustomizeEmptyState } from './connectors_customize_empty_state';

interface AgentConnectorsProps {
  agentId: string;
}

export const AgentConnectors = ({ agentId }: AgentConnectorsProps) => {
  const styles = useListDetailPageStyles();
  const { createAgentBuilderUrl } = useNavigation();
  const { actionTypeRegistry } = useKibana().services.plugins.triggersActionsUi;
  const agentQuery = useAgentBuilderAgentById(agentId);
  const { openCreateFlyout } = useConnectorsActions();
  const hasAllPrivileges = useHasConnectorsAllPrivileges();
  const canEditAgent = useCanUpdateAgent({ agent: agentQuery.agent ?? null });

  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConnectorId, setSelectedConnectorId] = useQueryState<string>(
    searchParamNames.connectorId
  );

  const {
    isOpen: isLibraryOpen,
    openFlyout: openLibrary,
    closeFlyout: closeLibrary,
  } = useFlyoutState();

  const {
    assignedConnectors,
    allConnectors,
    activeConnectorIdSet,
    isLoading: isConnectorsLoading,
    assign,
    unassign,
  } = useAgentConnectors({ agentId });

  const selectedConnector = useMemo(
    () => assignedConnectors.find((c) => c.id === selectedConnectorId) ?? null,
    [assignedConnectors, selectedConnectorId]
  );

  const filteredConnectors = useMemo(() => {
    if (!searchQuery.trim()) return assignedConnectors;
    const lower = searchQuery.toLowerCase();
    return assignedConnectors.filter((c) => {
      if (c.name.toLowerCase().includes(lower)) return true;
      const actionType = actionTypeRegistry.has(c.actionTypeId)
        ? actionTypeRegistry.get(c.actionTypeId)
        : null;
      return (
        (actionType?.actionTypeTitle ?? '').toLowerCase().includes(lower) ||
        (actionType?.selectMessage ?? '').toLowerCase().includes(lower)
      );
    });
  }, [assignedConnectors, searchQuery, actionTypeRegistry]);

  const isLoading = agentQuery.isLoading || isConnectorsLoading;

  // Keeps the selected connector in sync: auto-selects first on load, resets on removal, clears when filtered out
  useEffect(() => {
    if (agentQuery.isLoading || isConnectorsLoading) return;

    if (selectedConnectorId) {
      const stillAssigned = assignedConnectors.some((c) => c.id === selectedConnectorId);
      if (!stillAssigned) {
        // Connector was removed — reset to first remaining
        setSelectedConnectorId(assignedConnectors[0]?.id ?? null);
        return;
      }
      const visibleInFilter = filteredConnectors.some((c) => c.id === selectedConnectorId);
      if (!visibleInFilter) {
        // Search filtered out the selected connector — clear so list and panel stay in sync
        setSelectedConnectorId(null);
      }
      return;
    }

    // Nothing selected yet — auto-select first (skip when search is active to avoid jumping)
    if (!searchQuery.trim() && assignedConnectors.length > 0) {
      setSelectedConnectorId(assignedConnectors[0].id);
    }
  }, [
    assignedConnectors,
    filteredConnectors,
    searchQuery,
    selectedConnectorId,
    setSelectedConnectorId,
    agentQuery.isLoading,
    isConnectorsLoading,
  ]);

  const isAddDisabled = agentQuery.agent?.configuration?.connector_ids === undefined;
  const showCustomizeEmptyState = assignedConnectors.length === 0 && !searchQuery.trim();

  if (isLoading) {
    return (
      <EuiFlexGroup alignItems="center" justifyContent="center" css={styles.loadingSpinner}>
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }

  if (agentQuery.error || !agentQuery.agent) {
    return null;
  }

  return (
    <PageWrapper>
      {showCustomizeEmptyState ? (
        <ConnectorsCustomizeEmptyState canEditAgent={canEditAgent} onAddFromLibrary={openLibrary} />
      ) : (
        <>
          <div css={styles.header}>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size="l">
                  <h1>{labels.connectors.title}</h1>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">
                      <a href={createAgentBuilderUrl(appPaths.manage.connectors)}>
                        {labels.connectors.manageAllLink}
                      </a>
                    </EuiText>
                  </EuiFlexItem>
                  {hasAllPrivileges && canEditAgent && (
                    <EuiFlexItem grow={false}>
                      <EuiPopover
                        aria-label={labels.connectors.addConnectorPopoverLabel}
                        button={
                          <EuiButton
                            fill
                            iconType="plusInCircle"
                            iconSide="left"
                            onClick={() => setIsAddMenuOpen((prev) => !prev)}
                            data-test-subj="agentBuilderAddConnectorButton"
                          >
                            {labels.connectors.addConnectorButton}
                          </EuiButton>
                        }
                        isOpen={isAddMenuOpen}
                        closePopover={() => setIsAddMenuOpen(false)}
                        anchorPosition="downLeft"
                        panelPaddingSize="none"
                      >
                        <EuiContextMenuPanel
                          items={[
                            <EuiContextMenuItem
                              key="from-library"
                              icon="importAction"
                              disabled={isAddDisabled}
                              onClick={() => {
                                setIsAddMenuOpen(false);
                                openLibrary();
                              }}
                            >
                              {labels.connectors.fromLibraryMenuItem}
                            </EuiContextMenuItem>,
                            <EuiContextMenuItem
                              key="create-new"
                              icon="plusInCircle"
                              onClick={() => {
                                setIsAddMenuOpen(false);
                                openCreateFlyout();
                              }}
                            >
                              {labels.connectors.createNewMenuItem}
                            </EuiContextMenuItem>,
                          ]}
                        />
                      </EuiPopover>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />
            <EuiText size="m" color="default">
              {labels.connectors.pageDescription}
            </EuiText>
          </div>

          <EuiFlexGroup gutterSize="none" responsive={false} css={styles.body}>
            <EuiFlexItem grow={false} css={styles.searchColumn}>
              <div css={styles.searchInputWrapper}>
                <EuiFieldSearch
                  placeholder={labels.connectors.searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  incremental
                  fullWidth
                />
              </div>
              <EuiFlexGroup direction="column" gutterSize="xs" css={styles.scrollableList}>
                {filteredConnectors.length === 0 ? (
                  <EuiText size="s" color="subdued" textAlign="center">
                    <p>
                      {searchQuery.trim()
                        ? labels.connectors.noMatchMessage
                        : labels.connectors.noConnectorsAssignedMessage}
                    </p>
                  </EuiText>
                ) : (
                  filteredConnectors.map((connector) => (
                    <EuiFlexItem key={connector.id} grow={false}>
                      <ActiveConnectorRow
                        connector={connector}
                        isSelected={selectedConnectorId === connector.id}
                        onSelect={(c) => setSelectedConnectorId(c.id)}
                        onRemove={unassign}
                        canEditAgent={canEditAgent}
                      />
                    </EuiFlexItem>
                  ))
                )}
              </EuiFlexGroup>
            </EuiFlexItem>

            <EuiFlexItem css={styles.detailPanelWrapper}>
              {selectedConnector ? (
                <ConnectorDetailPanel
                  connector={selectedConnector}
                  agentId={agentId}
                  onRemove={(c) => {
                    unassign(c);
                    setSelectedConnectorId(null);
                  }}
                  canEditAgent={canEditAgent}
                />
              ) : (
                <EuiFlexGroup
                  justifyContent="center"
                  alignItems="center"
                  css={styles.noSelectionPlaceholder}
                >
                  <EuiText size="s" color="subdued">
                    {labels.connectors.noSelectionMessage}
                  </EuiText>
                </EuiFlexGroup>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {isLibraryOpen && (
        <ConnectorLibraryPanel
          onClose={closeLibrary}
          allConnectors={allConnectors}
          activeConnectorIdSet={activeConnectorIdSet}
          onToggle={(connector, isActive) => (isActive ? assign(connector) : unassign(connector))}
        />
      )}
    </PageWrapper>
  );
};
