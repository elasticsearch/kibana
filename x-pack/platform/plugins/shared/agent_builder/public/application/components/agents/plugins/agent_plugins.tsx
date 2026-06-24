/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { PluginDefinition } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { useQueryState } from '../../../hooks/use_query_state';
import { searchParamNames } from '../../../search_param_names';
import { labels } from '../../../utils/i18n';
import { appPaths } from '../../../utils/app_paths';
import { useNavigation } from '../../../hooks/use_navigation';
import { usePluginsService } from '../../../hooks/plugins/use_plugins';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useFlyoutState } from '../../../hooks/use_flyout_state';
import { ActiveItemRow } from '../common/active_item_row';
import { PluginLibraryPanel } from './plugin_library_panel';
import { PluginDetailPanel } from './plugin_detail_panel';
import { InstallPluginFlyout } from './install_plugin_flyout';
import { PluginAddMenuPanel } from './plugin_add_menu_panel';
import { PageWrapper } from '../common/page_wrapper';
import { PluginsCustomizeEmptyState } from './plugins_customize_empty_state';
import { useListDetailPageStyles } from '../common/styles';
import { useCanUpdateAgent } from '../../../hooks/agents/use_can_update_agent';
import { usePluginsMutation } from './use_plugins_mutation';

export const AgentPlugins: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const styles = useListDetailPageStyles();
  const { createAgentBuilderUrl } = useNavigation();

  const { agent, isLoading: agentLoading } = useAgentBuilderAgentById(agentId);
  const { plugins: allPlugins, isLoading: pluginsLoading } = usePluginsService();
  const canEditAgent = useCanUpdateAgent({ agent });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPluginId, setSelectedPluginId] = useQueryState<string>(searchParamNames.pluginId);
  const pendingSelectPluginIdRef = useRef<string | null>(null);
  const [isHeaderInstallMenuOpen, setIsHeaderInstallMenuOpen] = useState(false);
  const { handleAddPlugin, handleRemovePlugin } = usePluginsMutation({ agent });
  const {
    isOpen: isLibraryOpen,
    openFlyout: openLibrary,
    closeFlyout: closeLibrary,
  } = useFlyoutState();
  const {
    isOpen: isInstallFlyoutOpen,
    openFlyout: openInstallFlyout,
    closeFlyout: closeInstallFlyout,
  } = useFlyoutState();

  const handleOpenLibrary = useCallback(() => {
    setIsHeaderInstallMenuOpen(false);
    openLibrary();
  }, [openLibrary]);

  const handleOpenInstallFlyout = useCallback(() => {
    setIsHeaderInstallMenuOpen(false);
    openInstallFlyout();
  }, [openInstallFlyout]);

  const agentPluginIds = useMemo(
    () => agent?.configuration?.plugin_ids,
    [agent?.configuration?.plugin_ids]
  );

  const agentPluginIdSet = useMemo(
    () => (agentPluginIds ? new Set(agentPluginIds) : undefined),
    [agentPluginIds]
  );

  const enableElasticCapabilities = agent?.configuration?.enable_elastic_capabilities ?? false;

  const builtinPlugins = useMemo(() => allPlugins.filter((p) => p.readonly), [allPlugins]);

  const builtinPluginIdSet = useMemo(
    () => new Set(builtinPlugins.map((p) => p.id)),
    [builtinPlugins]
  );

  const activePlugins = useMemo(() => {
    if (!agentPluginIdSet) return [];
    if (enableElasticCapabilities) {
      const explicitPlugins = allPlugins.filter((p) => agentPluginIdSet.has(p.id));
      const builtinNotExplicit = builtinPlugins.filter((p) => !agentPluginIdSet.has(p.id));
      return [...explicitPlugins, ...builtinNotExplicit];
    }
    return allPlugins.filter((p) => agentPluginIdSet.has(p.id));
  }, [allPlugins, agentPluginIdSet, enableElasticCapabilities, builtinPlugins]);

  useEffect(() => {
    if (agentLoading || pluginsLoading) return;

    // When a newly added plugin is pending to be selected. Once it is active, select it.
    if (pendingSelectPluginIdRef.current) {
      const pendingInActive = activePlugins.some((p) => p.id === pendingSelectPluginIdRef.current);
      if (pendingInActive) {
        setSelectedPluginId(pendingSelectPluginIdRef.current);
        pendingSelectPluginIdRef.current = null;
        return;
      }
    }

    // Select first plugin when no plugin is currently selected, like on first render
    if (!selectedPluginId) {
      if (activePlugins.length > 0) {
        setSelectedPluginId(activePlugins[0].id);
      }
      return;
    }

    // Selected plugin is no longer active, for example after deleting a skill
    const selectedPluginNotActive = activePlugins.every((p) => p.id !== selectedPluginId);
    if (selectedPluginNotActive) {
      setSelectedPluginId(activePlugins[0]?.id ?? null);
    }
  }, [activePlugins, selectedPluginId, setSelectedPluginId, agentLoading, pluginsLoading]);

  const filteredActivePlugins = useMemo(() => {
    if (!searchQuery.trim()) return activePlugins;
    const lower = searchQuery.toLowerCase();
    return activePlugins.filter(
      (p) => p.name.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower)
    );
  }, [activePlugins, searchQuery]);

  const handleSelectPlugin = useCallback(
    (pluginId: string) => {
      setSelectedPluginId(pluginId);
    },
    [setSelectedPluginId]
  );

  const handleRemovePluginWithReport = useCallback(
    (plugin: PluginDefinition) => {
      handleRemovePlugin(plugin);
    },
    [handleRemovePlugin]
  );

  const handleTogglePlugin = useCallback(
    (plugin: PluginDefinition, isActive: boolean) => {
      if (enableElasticCapabilities && plugin.readonly) return;
      if (isActive) {
        handleAddPlugin(plugin);
      } else {
        handleRemovePlugin(plugin);
      }
    },
    [handleAddPlugin, handleRemovePlugin, enableElasticCapabilities]
  );

  const handleRemoveSelectedPlugin = useCallback(() => {
    if (!selectedPluginId) return;
    const plugin = activePlugins.find((p) => p.id === selectedPluginId);
    if (plugin) {
      if (enableElasticCapabilities && plugin.readonly) return;
      handleRemovePluginWithReport(plugin);
    }
  }, [selectedPluginId, activePlugins, handleRemovePluginWithReport, enableElasticCapabilities]);

  const libraryActivePluginIdSet = useMemo(() => {
    if (!agentPluginIdSet) return new Set<string>();
    if (enableElasticCapabilities) return new Set([...agentPluginIdSet, ...builtinPluginIdSet]);
    return agentPluginIdSet;
  }, [agentPluginIdSet, enableElasticCapabilities, builtinPluginIdSet]);

  const showCustomizeEmptyState = activePlugins.length === 0 && !searchQuery.trim();

  const isLoading = agentLoading || pluginsLoading;

  if (isLoading) {
    return (
      <EuiFlexGroup alignItems="center" justifyContent="center" css={styles.loadingSpinner}>
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }

  const pluginModals = (
    <>
      {isLibraryOpen ? (
        <PluginLibraryPanel
          onClose={closeLibrary}
          allPlugins={allPlugins}
          activePluginIdSet={libraryActivePluginIdSet}
          onTogglePlugin={handleTogglePlugin}
        />
      ) : null}
      {isInstallFlyoutOpen ? (
        <InstallPluginFlyout
          onClose={closeInstallFlyout}
          onPluginInstalled={(plugin) =>
            handleAddPlugin(plugin, {
              onSuccess: () => {
                pendingSelectPluginIdRef.current = plugin.id;
              },
            })
          }
        />
      ) : null}
    </>
  );

  return (
    <PageWrapper>
      {showCustomizeEmptyState ? (
        <PluginsCustomizeEmptyState
          canEditAgent={canEditAgent}
          onAddFromLibrary={handleOpenLibrary}
          onInstallFromUrlOrZip={handleOpenInstallFlyout}
        />
      ) : (
        <>
          <div css={styles.header}>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiTitle size="l">
                  <h1>{labels.plugins.title}</h1>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty href={createAgentBuilderUrl(appPaths.manage.plugins)}>
                      {labels.agentPlugins.manageAllPlugins}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                  {canEditAgent ? (
                    <EuiFlexItem grow={false}>
                      <EuiPopover
                        aria-label={labels.agentPlugins.installPluginButton}
                        button={
                          <EuiButton
                            fill
                            iconType="plusInCircle"
                            iconSide="left"
                            onClick={() => setIsHeaderInstallMenuOpen((prev) => !prev)}
                          >
                            {labels.agentPlugins.installPluginButton}
                          </EuiButton>
                        }
                        isOpen={isHeaderInstallMenuOpen}
                        closePopover={() => setIsHeaderInstallMenuOpen(false)}
                        anchorPosition="downLeft"
                        panelPaddingSize="none"
                      >
                        <PluginAddMenuPanel
                          onInstallFromUrlOrZip={handleOpenInstallFlyout}
                          onAddFromLibrary={handleOpenLibrary}
                        />
                      </EuiPopover>
                    </EuiFlexItem>
                  ) : null}
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />
            <EuiText size="m" color="default">
              {labels.agentPlugins.pageDescription}
            </EuiText>
          </div>

          <EuiFlexGroup gutterSize="none" responsive={false} css={styles.body}>
            <EuiFlexItem grow={false} css={styles.searchColumn}>
              <div css={styles.searchInputWrapper}>
                <EuiFieldSearch
                  placeholder={labels.agentPlugins.searchActivePluginsPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  incremental
                  fullWidth
                />
              </div>

              <div css={styles.scrollableList}>
                {filteredActivePlugins.length === 0 ? (
                  <EuiText size="s" color="subdued" textAlign="center">
                    <p>
                      {searchQuery.trim()
                        ? labels.agentPlugins.noActivePluginsMatchMessage
                        : labels.agentPlugins.noActivePluginsMessage}
                    </p>
                  </EuiText>
                ) : (
                  filteredActivePlugins.map((plugin) => (
                    <ActiveItemRow
                      key={plugin.id}
                      id={plugin.id}
                      name={plugin.name}
                      isSelected={selectedPluginId === plugin.id}
                      onSelect={() => handleSelectPlugin(plugin.id)}
                      onRemove={() => handleRemovePluginWithReport(plugin)}
                      removeAriaLabel={labels.agentPlugins.removePluginAriaLabel}
                      readOnlyContent={
                        enableElasticCapabilities && plugin.readonly ? (
                          <EuiBadge color="hollow">{labels.agentPlugins.autoBadge}</EuiBadge>
                        ) : undefined
                      }
                      canEditAgent={canEditAgent}
                      ebtProps={getEbtProps({
                        element: AGENT_BUILDER_UI_EBT.element.pageContent,
                        action: AGENT_BUILDER_UI_EBT.action.agentCustomization.ENTITY_DETAIL_VIEW,
                        detail: AGENT_BUILDER_UI_EBT.entity.PLUGIN,
                      })}
                      removeEbtProps={getEbtProps({
                        element: AGENT_BUILDER_UI_EBT.element.pageContent,
                        action: AGENT_BUILDER_UI_EBT.action.agentCustomization.ENTITY_REMOVE,
                        detail: AGENT_BUILDER_UI_EBT.entity.PLUGIN,
                      })}
                    />
                  ))
                )}
              </div>
            </EuiFlexItem>

            <EuiFlexItem css={styles.detailPanelWrapper}>
              {selectedPluginId ? (
                <PluginDetailPanel
                  pluginId={selectedPluginId}
                  onRemove={handleRemoveSelectedPlugin}
                />
              ) : (
                <EuiFlexGroup
                  justifyContent="center"
                  alignItems="center"
                  css={styles.noSelectionPlaceholder}
                >
                  <EuiText size="s" color="subdued">
                    {labels.agentPlugins.noPluginSelectedMessage}
                  </EuiText>
                </EuiFlexGroup>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {pluginModals}
    </PageWrapper>
  );
};
