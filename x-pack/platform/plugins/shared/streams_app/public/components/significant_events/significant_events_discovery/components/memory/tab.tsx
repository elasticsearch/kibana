/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiTreeView,
} from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import { FormattedRelative } from '@kbn/i18n-react';
import { useStreamsPrivileges } from '../../../../../hooks/use_streams_privileges';
import {
  useConsolidateMemory,
  useMemorySearch,
  useMemoryTree,
  useRecentChanges,
  useScrapeConversations,
  useSynthesizeMemory,
  useDetectGaps,
  useMemoryWorkflowsEnabled,
  useToggleMemoryWorkflows,
} from './use_memory';
import type { MemoryCategoryNode, MemoryVersionRecord } from './types';
import { EntryFlyout } from './entry_flyout';
import { ChangeFlyout } from './change_flyout';
import { CreateEntryFlyout } from './create_entry_flyout';
import { RecentChangeItem } from './recent_change_item';

export function MemoryTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedChange, setSelectedChange] = useState<MemoryVersionRecord | null>(null);
  const [isActionsPopoverOpen, setIsActionsPopoverOpen] = useState(false);
  const [showCreateFlyout, setShowCreateFlyout] = useState(false);

  const {
    ui: { manage: canManage },
  } = useStreamsPrivileges();

  const { data: treeData, isLoading: isTreeLoading } = useMemoryTree();
  const { data: searchData, isLoading: isSearchLoading } = useMemorySearch(searchQuery);
  const { data: recentChangesData, isLoading: isRecentChangesLoading } = useRecentChanges();

  const scrapeConversations = useScrapeConversations();
  const consolidateMemory = useConsolidateMemory();
  const synthesizeMemory = useSynthesizeMemory();
  const detectGaps = useDetectGaps();
  const { data: workflowsEnabledData, isLoading: isWorkflowsEnabledLoading } =
    useMemoryWorkflowsEnabled();
  const toggleWorkflows = useToggleMemoryWorkflows();
  const workflowsEnabled = workflowsEnabledData?.enabled ?? false;

  const workflowActions: Array<{
    key: string;
    icon: string;
    label: string;
    testSubj: string;
    requiresManage: boolean;
    mutation: { isLoading: boolean; mutate: () => void };
  }> = [
    {
      key: 'scrape',
      icon: 'refresh',
      label: i18n.translate('xpack.streams.memory.scrapeButton', {
        defaultMessage: 'Scrape Conversations',
      }),
      testSubj: 'streamsMemoryScrapeButton',
      requiresManage: true,
      mutation: scrapeConversations,
    },
    {
      key: 'consolidate',
      icon: 'broom',
      label: i18n.translate('xpack.streams.memory.consolidateButton', {
        defaultMessage: 'Consolidate Memory',
      }),
      testSubj: 'streamsMemoryConsolidateButton',
      requiresManage: true,
      mutation: consolidateMemory,
    },
    {
      key: 'synthesize',
      icon: 'sparkles',
      label: i18n.translate('xpack.streams.memory.synthesizeButton', {
        defaultMessage: 'Synthesize Memory',
      }),
      testSubj: 'streamsMemorySynthesizeButton',
      requiresManage: true,
      mutation: synthesizeMemory,
    },
    {
      key: 'detectGaps',
      icon: 'inspect',
      label: i18n.translate('xpack.streams.memory.detectGapsButton', {
        defaultMessage: 'Detect Gaps',
      }),
      testSubj: 'streamsMemoryDetectGapsButton',
      requiresManage: false,
      mutation: detectGaps,
    },
  ];

  const isSearchActive = searchQuery.length >= 2;

  const treeItems = useMemo(() => {
    if (!treeData) return [];
    const items = toTreeItems(treeData.tree, setSelectedEntryId);
    if (treeData.uncategorized.length > 0) {
      items.push({
        id: '__uncategorized__',
        label: (
          <EuiText size="s">
            {i18n.translate('xpack.streams.memory.uncategorized', {
              defaultMessage: 'Uncategorized',
            })}
          </EuiText>
        ),
        children: treeData.uncategorized.map((page) => ({
          id: page.id,
          label: <EuiLink onClick={() => setSelectedEntryId(page.id)}>{page.title}</EuiLink>,
        })),
      });
    }
    return items;
  }, [treeData]);

  return (
    <>
      <EuiFlexGroup
        gutterSize="l"
        className={css`
          height: 100%;
          min-height: 0;
        `}
      >
        {/* Left column: search + tree/search results */}
        <EuiFlexItem
          grow={2}
          className={css`
            min-height: 0;
          `}
        >
          <EuiFlexGroup
            direction="column"
            gutterSize="m"
            className={css`
              height: 100%;
            `}
          >
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                <EuiFlexItem>
                  <EuiFieldSearch
                    placeholder={i18n.translate('xpack.streams.memory.searchPlaceholder', {
                      defaultMessage: 'Search memory entries...',
                    })}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    incremental
                    isClearable
                    fullWidth
                    data-test-subj="streamsMemorySearch"
                  />
                </EuiFlexItem>
                {canManage && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonIcon
                      iconType="plusInCircle"
                      aria-label={i18n.translate('xpack.streams.memory.newEntryButton', {
                        defaultMessage: 'New memory entry',
                      })}
                      onClick={() => setShowCreateFlyout(true)}
                      data-test-subj="streamsMemoryNewEntryButton"
                    />
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiPopover
                    button={
                      <EuiButtonIcon
                        iconType="boxesHorizontal"
                        aria-label={i18n.translate('xpack.streams.memory.workflowActionsButton', {
                          defaultMessage: 'Workflow actions',
                        })}
                        onClick={() => setIsActionsPopoverOpen((v) => !v)}
                        data-test-subj="streamsMemoryWorkflowActionsButton"
                      />
                    }
                    isOpen={isActionsPopoverOpen}
                    closePopover={() => setIsActionsPopoverOpen(false)}
                    panelPaddingSize="none"
                    anchorPosition="downRight"
                  >
                    <EuiContextMenuPanel
                      items={[
                        ...(canManage
                          ? [
                              <EuiContextMenuItem
                                key="toggleWorkflows"
                                icon={
                                  isWorkflowsEnabledLoading || toggleWorkflows.isLoading ? (
                                    <EuiLoadingSpinner size="s" />
                                  ) : workflowsEnabled ? (
                                    'pause'
                                  ) : (
                                    'play'
                                  )
                                }
                                onClick={() => {
                                  toggleWorkflows.mutate(!workflowsEnabled, {
                                    onSettled: () => setIsActionsPopoverOpen(false),
                                  });
                                }}
                                disabled={isWorkflowsEnabledLoading || toggleWorkflows.isLoading}
                                data-test-subj="streamsMemoryToggleWorkflowsButton"
                              >
                                {workflowsEnabled
                                  ? i18n.translate('xpack.streams.memory.disableWorkflowsButton', {
                                      defaultMessage: 'Disable background workflows',
                                    })
                                  : i18n.translate('xpack.streams.memory.enableWorkflowsButton', {
                                      defaultMessage: 'Enable background workflows',
                                    })}
                              </EuiContextMenuItem>,
                            ]
                          : []),
                        ...workflowActions.map((action) => (
                          <EuiContextMenuItem
                            key={action.key}
                            icon={
                              action.mutation.isLoading ? (
                                <EuiLoadingSpinner size="s" />
                              ) : (
                                action.icon
                              )
                            }
                            onClick={() => {
                              action.mutation.mutate();
                              setIsActionsPopoverOpen(false);
                            }}
                            disabled={
                              action.mutation.isLoading || (action.requiresManage && !canManage)
                            }
                            data-test-subj={action.testSubj}
                          >
                            {action.label}
                          </EuiContextMenuItem>
                        )),
                      ]}
                    />
                  </EuiPopover>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem
              className={css`
                overflow-y: auto;
                min-height: 0;
              `}
            >
              {isSearchActive ? (
                isSearchLoading ? (
                  <EuiLoadingSpinner size="l" />
                ) : (
                  <EuiFlexGroup direction="column" gutterSize="s">
                    {(searchData?.results ?? []).map((result) => (
                      <EuiFlexItem key={result.id}>
                        <EuiPanel hasShadow={false} hasBorder paddingSize="s">
                          <EuiLink onClick={() => setSelectedEntryId(result.id)}>
                            <strong>{result.title}</strong>
                          </EuiLink>
                          <EuiSpacer size="xs" />
                          <EuiText size="s">{result.snippet}</EuiText>
                          <EuiSpacer size="xs" />
                          <EuiFlexGroup gutterSize="xs" alignItems="center" wrap>
                            <EuiFlexItem grow={false}>
                              <EuiText size="xs" color="subdued">
                                <FormattedRelative value={result.updated_at} /> ·{' '}
                                {result.updated_by}
                              </EuiText>
                            </EuiFlexItem>
                            {result.tags.map((tag) => (
                              <EuiFlexItem key={tag} grow={false}>
                                <EuiBadge color="hollow">{tag}</EuiBadge>
                              </EuiFlexItem>
                            ))}
                          </EuiFlexGroup>
                        </EuiPanel>
                      </EuiFlexItem>
                    ))}
                    {searchData?.results.length === 0 && (
                      <EuiText color="subdued">
                        {i18n.translate('xpack.streams.memory.noResults', {
                          defaultMessage: 'No memory entries found.',
                        })}
                      </EuiText>
                    )}
                  </EuiFlexGroup>
                )
              ) : isTreeLoading ? (
                <EuiLoadingSpinner size="l" />
              ) : treeItems.length > 0 ? (
                <EuiTreeView
                  items={treeItems}
                  expandByDefault
                  aria-label={i18n.translate('xpack.streams.memory.treeAriaLabel', {
                    defaultMessage: 'Memory entries tree',
                  })}
                />
              ) : (
                <EuiText color="subdued">
                  {i18n.translate('xpack.streams.memory.empty', {
                    defaultMessage:
                      'No memory entries yet. Agents will automatically create entries as they learn, or you can create entries manually.',
                  })}
                </EuiText>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        {/* Right column: recent changes */}
        {!isSearchActive && (
          <EuiFlexItem
            grow={1}
            className={css`
              overflow-y: auto;
              min-height: 0;
            `}
          >
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xpack.streams.memory.recentChanges.title', {
                  defaultMessage: 'Recent Changes',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            {isRecentChangesLoading ? (
              <EuiLoadingSpinner size="l" />
            ) : (recentChangesData?.changes ?? []).length > 0 ? (
              <EuiFlexGroup direction="column" gutterSize="s">
                {(recentChangesData?.changes ?? []).map((change) => (
                  <EuiFlexItem key={change.id} grow={false}>
                    <RecentChangeItem change={change} onClick={() => setSelectedChange(change)} />
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ) : (
              <EuiText size="s" color="subdued">
                {i18n.translate('xpack.streams.memory.recentChanges.empty', {
                  defaultMessage: 'No recent changes.',
                })}
              </EuiText>
            )}
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {selectedEntryId && (
        <EntryFlyout entryId={selectedEntryId} onClose={() => setSelectedEntryId(null)} />
      )}
      {selectedChange && (
        <ChangeFlyout
          change={selectedChange}
          onClose={() => setSelectedChange(null)}
          onViewEntry={(id) => {
            setSelectedChange(null);
            setSelectedEntryId(id);
          }}
        />
      )}
      {showCreateFlyout && (
        <CreateEntryFlyout
          onClose={() => setShowCreateFlyout(false)}
          onCreated={(id) => {
            setShowCreateFlyout(false);
            setSelectedEntryId(id);
          }}
        />
      )}
    </>
  );
}

interface TreeItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactElement;
  iconWhenExpanded?: React.ReactElement;
  children?: TreeItem[];
}

const toTreeItems = (nodes: MemoryCategoryNode[], onSelect: (id: string) => void): TreeItem[] => {
  return nodes.map((node) => {
    const pageItems: TreeItem[] = node.pages.map((page) => ({
      id: page.id,
      label: <EuiLink onClick={() => onSelect(page.id)}>{page.title}</EuiLink>,
    }));

    const childItems = node.children.length > 0 ? toTreeItems(node.children, onSelect) : [];
    const allChildren = [...pageItems, ...childItems];

    return {
      id: node.category,
      label: node.name,
      icon: <EuiIcon type="folderClosed" size="s" aria-hidden={true} />,
      iconWhenExpanded: <EuiIcon type="folderOpen" size="s" aria-hidden={true} />,
      ...(allChildren.length > 0 ? { children: allChildren } : {}),
    };
  });
};
