/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiComboBox,
  EuiConfirmModal,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLink,
  EuiLoadingSpinner,
  EuiMarkdownFormat,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiTreeView,
  useEuiTheme,
  transparentize,
} from '@elastic/eui';
import type { EuiBasicTableColumn, EuiComboBoxOptionOption } from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import { diffLines } from 'diff';
import { useStreamsPrivileges } from '../../../../../hooks/use_streams_privileges';
import {
  useMemoryTree,
  useMemorySearch,
  useMemoryEntry,
  useMemoryHistory,
  useMemoryVersion,
  useMemoryMutations,
  useRecentChanges,
  useScrapeConversations,
  useConsolidateMemory,
  useSynthesizeMemory,
  useDetectGaps,
} from './use_memory';
import type { MemoryCategoryNode, MemoryVersionRecord } from './types';

export function MemoryTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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

  const handleCloseFlyout = useCallback(() => {
    setSelectedEntryId(null);
    setShowHistory(false);
  }, []);

  return (
    <>
      <EuiFlexGroup
        gutterSize="l"
        className={css`
          min-height: 0;
        `}
      >
        {/* Left column: search + tree/search results */}
        <EuiFlexItem
          grow={2}
          className={css`
            overflow-y: auto;
            min-height: 0;
          `}
        >
          <EuiFlexGroup
            gutterSize="s"
            responsive={false}
            className={css`
              flex-grow: 0;
            `}
          >
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="refresh"
                isLoading={scrapeConversations.isLoading}
                isDisabled={!canManage}
                onClick={() => scrapeConversations.mutate()}
                data-test-subj="streamsMemoryScrapeButton"
                title={i18n.translate('xpack.streams.memory.scrapeButtonTitle', {
                  defaultMessage:
                    'Scrape agent conversations and extract durable knowledge into memory pages.',
                })}
              >
                {i18n.translate('xpack.streams.memory.scrapeButton', {
                  defaultMessage: 'Scrape Conversations',
                })}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="broom"
                isLoading={consolidateMemory.isLoading}
                isDisabled={!canManage}
                onClick={() => consolidateMemory.mutate()}
                data-test-subj="streamsMemoryConsolidateButton"
                title={i18n.translate('xpack.streams.memory.consolidateButtonTitle', {
                  defaultMessage:
                    'Merge duplicate pages, remove stale entries, and improve categorization.',
                })}
              >
                {i18n.translate('xpack.streams.memory.consolidateButton', {
                  defaultMessage: 'Consolidate Memory',
                })}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="sparkles"
                isLoading={synthesizeMemory.isLoading}
                isDisabled={!canManage}
                onClick={() => synthesizeMemory.mutate()}
                data-test-subj="streamsMemorySynthesizeButton"
                title={i18n.translate('xpack.streams.memory.synthesizeButtonTitle', {
                  defaultMessage:
                    'Synthesize significant events knowledge indicators into new wiki pages.',
                })}
              >
                {i18n.translate('xpack.streams.memory.synthesizeButton', {
                  defaultMessage: 'Synthesize Memory',
                })}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="inspect"
                isLoading={detectGaps.isLoading}
                onClick={() => detectGaps.mutate()}
                data-test-subj="streamsMemoryDetectGapsButton"
              >
                {i18n.translate('xpack.streams.memory.detectGapsButton', {
                  defaultMessage: 'Detect Gaps',
                })}
              </EuiButton>
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
          </EuiFlexGroup>
          <EuiSpacer size="s" />
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
          <EuiSpacer size="m" />

          {isSearchActive ? (
            isSearchLoading ? (
              <EuiLoadingSpinner size="l" />
            ) : (
              <EuiFlexGroup direction="column" gutterSize="s">
                {searchData?.results.map((result) => (
                  <EuiFlexItem key={result.id}>
                    <EuiFlexGroup direction="column" gutterSize="xs">
                      <EuiFlexItem>
                        <EuiLink onClick={() => setSelectedEntryId(result.id)}>
                          <strong>{result.title}</strong>
                        </EuiLink>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="xs" color="subdued">
                          {result.name}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem>
                        <EuiText size="s">{result.snippet}</EuiText>
                      </EuiFlexItem>
                    </EuiFlexGroup>
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

        {/* Right column: recent changes timeline */}
        {!isSearchActive && (
          <EuiFlexItem grow={1}>
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
              <EuiFlexGroup
                direction="column"
                gutterSize="s"
                className={css`
                  max-height: 600px;
                  overflow-y: auto;
                `}
              >
                {(recentChangesData?.changes ?? []).map((change) => (
                  <EuiFlexItem key={change.id} grow={false}>
                    <RecentChangeItem
                      change={change}
                      onClick={() => setSelectedEntryId(change.entry_id)}
                    />
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

      {selectedEntryId && !showHistory && (
        <EntryFlyout
          entryId={selectedEntryId}
          onClose={handleCloseFlyout}
          onShowHistory={() => setShowHistory(true)}
        />
      )}
      {selectedEntryId && showHistory && (
        <HistoryFlyout
          entryId={selectedEntryId}
          onClose={handleCloseFlyout}
          onBack={() => setShowHistory(false)}
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

const toTreeItems = (
  nodes: MemoryCategoryNode[],
  onSelect: (id: string) => void
): Array<{
  id: string;
  label: React.ReactNode;
  children?: Array<{ id: string; label: React.ReactNode }>;
}> => {
  return nodes.map((node) => {
    const pageItems = node.pages.map((page) => ({
      id: page.id,
      label: <EuiLink onClick={() => onSelect(page.id)}>{page.title}</EuiLink>,
    }));

    const childItems = node.children.length > 0 ? toTreeItems(node.children, onSelect) : [];

    const allChildren = [...pageItems, ...childItems];

    return {
      id: node.category,
      label: <EuiText size="s">{node.name}</EuiText>,
      ...(allChildren.length > 0 ? { children: allChildren } : {}),
    };
  });
};

function EntryFlyout({
  entryId,
  onClose,
  onShowHistory,
}: {
  entryId: string;
  onClose: () => void;
  onShowHistory: () => void;
}) {
  const { data: entry, isLoading } = useMemoryEntry(entryId);
  const { data: treeData } = useMemoryTree();
  const { updateEntry, deleteEntry } = useMemoryMutations();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editCategories, setEditCategories] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [editTags, setEditTags] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const categoryOptions = useMemo(() => {
    const paths = new Set<string>();
    const collect = (nodes: MemoryCategoryNode[]) => {
      for (const node of nodes) {
        paths.add(node.category);
        collect(node.children);
      }
    };
    collect(treeData?.tree ?? []);
    return Array.from(paths).map((p) => ({ label: p }));
  }, [treeData]);

  const editCategoryLabels = editCategories.map((c) => c.label);
  const editTagLabels = editTags.map((t) => t.label);
  const isDirty =
    isEditing &&
    !!entry &&
    (editContent !== entry.content ||
      editCategoryLabels.length !== entry.categories.length ||
      editCategoryLabels.some((cat, i) => cat !== entry.categories[i]) ||
      editTagLabels.length !== entry.tags.length ||
      editTagLabels.some((tag, i) => tag !== entry.tags[i]));

  const handleEdit = useCallback(() => {
    if (entry) {
      setEditContent(entry.content);
      setEditCategories(entry.categories.map((cat) => ({ label: cat })));
      setEditTags(entry.tags.map((tag) => ({ label: tag })));
      setIsEditing(true);
    }
  }, [entry]);

  const handleSave = useCallback(() => {
    if (entry && isDirty) {
      updateEntry.mutate(
        {
          id: entry.id,
          content: editContent,
          categories: editCategoryLabels,
          tags: editTagLabels,
          change_summary: 'Manual edit via UI',
        },
        { onSuccess: () => setIsEditing(false) }
      );
    } else {
      setIsEditing(false);
    }
  }, [entry, isDirty, editContent, editCategoryLabels, editTagLabels, updateEntry]);

  const handleDelete = useCallback(() => {
    if (entry) {
      deleteEntry.mutate(entry.id, { onSuccess: onClose });
    }
  }, [entry, deleteEntry, onClose]);

  const handleClose = useCallback(() => {
    if (isDirty) {
      setShowDiscardModal(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleConfirmDiscard = useCallback(() => {
    setShowDiscardModal(false);
    setIsEditing(false);
    onClose();
  }, [onClose]);

  return (
    <>
      <EuiFlyout
        onClose={handleClose}
        size="m"
        data-test-subj="streamsMemoryEntryFlyout"
        aria-label={i18n.translate('xpack.streams.memory.entryFlyoutAriaLabel', {
          defaultMessage: 'Memory entry detail',
        })}
      >
        <EuiFlyoutHeader hasBorder>
          {isLoading ? (
            <EuiLoadingSpinner size="l" />
          ) : entry ? (
            <>
              <EuiTitle size="m">
                <h2>{entry.title}</h2>
              </EuiTitle>
              <EuiText size="xs" color="subdued">
                {entry.categories.join(', ')}
              </EuiText>
              <EuiSpacer size="xs" />
              <EuiFlexGroup gutterSize="s" wrap>
                {entry.tags.map((tag) => (
                  <EuiFlexItem key={tag} grow={false}>
                    <EuiBadge>{tag}</EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
              <EuiSpacer size="xs" />
              <EuiText size="xs" color="subdued">
                {i18n.translate('xpack.streams.memory.entryMeta', {
                  defaultMessage: 'Version {version} · Updated {updatedAt} by {updatedBy}',
                  values: {
                    version: entry.version,
                    updatedAt: new Date(entry.updated_at).toLocaleString(),
                    updatedBy: entry.updated_by,
                  },
                })}
              </EuiText>
            </>
          ) : (
            <EuiText>
              {i18n.translate('xpack.streams.memory.entryNotFound', {
                defaultMessage: 'Memory entry not found.',
              })}
            </EuiText>
          )}
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          {entry &&
            (isEditing ? (
              <>
                <EuiTextArea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  fullWidth
                  rows={20}
                  data-test-subj="streamsMemoryEditArea"
                />
                <EuiSpacer size="s" />
                <EuiTitle size="xxs">
                  <h4>
                    {i18n.translate('xpack.streams.memory.categoriesLabel', {
                      defaultMessage: 'Categories',
                    })}
                  </h4>
                </EuiTitle>
                <EuiSpacer size="xs" />
                <EuiComboBox
                  options={categoryOptions}
                  selectedOptions={editCategories}
                  onChange={setEditCategories}
                  onCreateOption={(searchValue) =>
                    setEditCategories((prev) => [...prev, { label: searchValue }])
                  }
                  isClearable
                  fullWidth
                  placeholder={i18n.translate('xpack.streams.memory.categoriesPlaceholder', {
                    defaultMessage: 'e.g. infrastructure/kubernetes',
                  })}
                  data-test-subj="streamsMemoryEditCategories"
                />
                <EuiSpacer size="s" />
                <EuiTitle size="xxs">
                  <h4>
                    {i18n.translate('xpack.streams.memory.tagsLabel', {
                      defaultMessage: 'Tags',
                    })}
                  </h4>
                </EuiTitle>
                <EuiSpacer size="xs" />
                <EuiComboBox
                  selectedOptions={editTags}
                  onChange={setEditTags}
                  onCreateOption={(searchValue) =>
                    setEditTags((prev) => [...prev, { label: searchValue }])
                  }
                  isClearable
                  fullWidth
                  placeholder={i18n.translate('xpack.streams.memory.tagsEditPlaceholder', {
                    defaultMessage: 'Add tags',
                  })}
                  data-test-subj="streamsMemoryEditTags"
                />
                <EuiSpacer size="m" />
                <EuiFlexGroup gutterSize="s">
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      fill
                      onClick={handleSave}
                      isLoading={updateEntry.isLoading}
                      data-test-subj="streamsMemorySaveButton"
                    >
                      {i18n.translate('xpack.streams.memory.saveButton', {
                        defaultMessage: 'Save',
                      })}
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty onClick={() => setIsEditing(false)}>
                      {i18n.translate('xpack.streams.memory.cancelButton', {
                        defaultMessage: 'Cancel',
                      })}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            ) : (
              <EuiMarkdownFormat>{entry.content}</EuiMarkdownFormat>
            ))}
        </EuiFlyoutBody>
        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween">
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={onShowHistory} size="s">
                    {i18n.translate('xpack.streams.memory.historyButton', {
                      defaultMessage: 'History',
                    })}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton onClick={handleEdit} disabled={isEditing} size="s">
                    {i18n.translate('xpack.streams.memory.editButton', {
                      defaultMessage: 'Edit',
                    })}
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty color="danger" onClick={() => setShowDeleteModal(true)} size="s">
                {i18n.translate('xpack.streams.memory.deleteButton', {
                  defaultMessage: 'Delete',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>

      {showDeleteModal && entry && (
        <EuiConfirmModal
          aria-label={i18n.translate('xpack.streams.memory.deleteConfirmAriaLabel', {
            defaultMessage: 'Confirm delete memory entry',
          })}
          title={i18n.translate('xpack.streams.memory.deleteConfirmTitle', {
            defaultMessage: 'Delete memory entry',
          })}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          cancelButtonText={i18n.translate('xpack.streams.memory.deleteConfirmCancel', {
            defaultMessage: 'Cancel',
          })}
          confirmButtonText={i18n.translate('xpack.streams.memory.deleteConfirmButton', {
            defaultMessage: 'Delete',
          })}
          buttonColor="danger"
        >
          {i18n.translate('xpack.streams.memory.deleteConfirmBody', {
            defaultMessage:
              'Are you sure you want to delete "{title}"? This action cannot be undone.',
            values: { title: entry.title },
          })}
        </EuiConfirmModal>
      )}

      {showDiscardModal && (
        <EuiConfirmModal
          aria-label={i18n.translate('xpack.streams.memory.discardConfirmAriaLabel', {
            defaultMessage: 'Confirm discard changes',
          })}
          title={i18n.translate('xpack.streams.memory.discardConfirmTitle', {
            defaultMessage: 'Discard unsaved changes?',
          })}
          onCancel={() => setShowDiscardModal(false)}
          onConfirm={handleConfirmDiscard}
          cancelButtonText={i18n.translate('xpack.streams.memory.discardConfirmCancel', {
            defaultMessage: 'Keep editing',
          })}
          confirmButtonText={i18n.translate('xpack.streams.memory.discardConfirmButton', {
            defaultMessage: 'Discard',
          })}
          buttonColor="danger"
        >
          {i18n.translate('xpack.streams.memory.discardConfirmBody', {
            defaultMessage: 'You have unsaved changes. Are you sure you want to discard them?',
          })}
        </EuiConfirmModal>
      )}
    </>
  );
}

function HistoryFlyout({
  entryId,
  onClose,
  onBack,
}: {
  entryId: string;
  onClose: () => void;
  onBack: () => void;
}) {
  const { data: entry } = useMemoryEntry(entryId);
  const { data: historyData, isLoading } = useMemoryHistory(entryId);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const selectedRecord = useMemo(() => {
    if (selectedVersion === null || !historyData?.history) return undefined;
    return historyData.history.find((r) => r.version === selectedVersion);
  }, [selectedVersion, historyData]);

  const previousVersion = selectedVersion !== null ? selectedVersion - 1 : undefined;
  const { data: previousRecord } = useMemoryVersion(
    previousVersion && previousVersion >= 1 ? entryId : undefined,
    previousVersion && previousVersion >= 1 ? previousVersion : undefined
  );

  const { euiTheme } = useEuiTheme();
  const selectedRowBackground = transparentize(euiTheme.colors.primary, 0.1);

  const columns: Array<EuiBasicTableColumn<MemoryVersionRecord>> = [
    {
      field: 'version',
      name: i18n.translate('xpack.streams.memory.history.versionColumn', {
        defaultMessage: 'Version',
      }),
      width: '70px',
    },
    {
      field: 'change_type',
      name: i18n.translate('xpack.streams.memory.history.changeTypeColumn', {
        defaultMessage: 'Change',
      }),
      width: '90px',
      render: (changeType: string) => <EuiBadge>{changeType}</EuiBadge>,
    },
    {
      field: 'change_summary',
      name: i18n.translate('xpack.streams.memory.history.summaryColumn', {
        defaultMessage: 'Summary',
      }),
    },
    {
      field: 'created_at',
      name: i18n.translate('xpack.streams.memory.history.dateColumn', {
        defaultMessage: 'Date',
      }),
      width: '140px',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      name: i18n.translate('xpack.streams.memory.history.statusColumn', {
        defaultMessage: 'Status',
      }),
      width: '90px',
      render: (record: MemoryVersionRecord) => {
        const isCurrentVersion = entry && record.version === entry.version;
        return isCurrentVersion ? (
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.streams.memory.history.currentLabel', {
              defaultMessage: 'Current',
            })}
          </EuiText>
        ) : null;
      },
    },
  ];

  return (
    <EuiFlyout
      onClose={onClose}
      size="l"
      data-test-subj="streamsMemoryHistoryFlyout"
      aria-label={i18n.translate('xpack.streams.memory.historyFlyoutAriaLabel', {
        defaultMessage: 'Memory entry version history',
      })}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty iconType="arrowLeft" onClick={onBack} size="s">
              {i18n.translate('xpack.streams.memory.history.backButton', {
                defaultMessage: 'Back',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="m">
              <h2>
                {i18n.translate('xpack.streams.memory.history.title', {
                  defaultMessage: 'Version History',
                })}
              </h2>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
        {entry && (
          <EuiText size="xs" color="subdued">
            {entry.title}
          </EuiText>
        )}
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {isLoading ? (
          <EuiLoadingSpinner size="l" />
        ) : (
          <>
            <EuiBasicTable
              items={historyData?.history ?? []}
              columns={columns}
              tableCaption={i18n.translate('xpack.streams.memory.history.tableCaption', {
                defaultMessage: 'Version history',
              })}
              rowProps={(record) => ({
                onClick: () =>
                  setSelectedVersion(selectedVersion === record.version ? null : record.version),
                style: {
                  cursor: 'pointer',
                  ...(selectedVersion === record.version
                    ? { backgroundColor: selectedRowBackground }
                    : {}),
                },
              })}
              data-test-subj="streamsMemoryHistoryTable"
            />
            {selectedVersion !== null && selectedRecord && (
              <>
                <EuiSpacer size="m" />
                <EuiTitle size="xs">
                  <h3>
                    {i18n.translate('xpack.streams.memory.history.diffTitle', {
                      defaultMessage: 'Changes in version {version}',
                      values: { version: selectedVersion },
                    })}
                  </h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <MemoryDiffViewer
                  original={{
                    title: previousRecord?.title ?? '',
                    content: previousRecord?.content ?? '',
                    tags: previousRecord?.tags ?? [],
                    categories: previousRecord?.categories ?? [],
                  }}
                  modified={{
                    title: selectedRecord.title,
                    content: selectedRecord.content,
                    tags: selectedRecord.tags ?? [],
                    categories: selectedRecord.categories ?? [],
                  }}
                />
              </>
            )}
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
}

interface MemorySnapshot {
  title: string;
  content: string;
  tags: string[];
  categories: string[];
}

function MemoryDiffViewer({
  original,
  modified,
}: {
  original: MemorySnapshot;
  modified: MemorySnapshot;
}) {
  const { euiTheme } = useEuiTheme();

  const sections = [
    {
      label: i18n.translate('xpack.streams.memory.diffTitleLabel', { defaultMessage: 'Title' }),
      originalText: original.title,
      modifiedText: modified.title,
    },
    {
      label: i18n.translate('xpack.streams.memory.diffCategoriesLabel', {
        defaultMessage: 'Categories',
      }),
      originalText: original.categories.join('\n'),
      modifiedText: modified.categories.join('\n'),
    },
    {
      label: i18n.translate('xpack.streams.memory.diffTagsLabel', { defaultMessage: 'Tags' }),
      originalText: original.tags.join('\n'),
      modifiedText: modified.tags.join('\n'),
    },
    {
      label: i18n.translate('xpack.streams.memory.diffContentLabel', {
        defaultMessage: 'Content',
      }),
      originalText: original.content,
      modifiedText: modified.content,
      alwaysShow: true,
    },
  ].filter((s) => s.alwaysShow || s.originalText !== s.modifiedText);

  return (
    <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="streamsMemoryDiffViewer">
      {sections.map((section) => {
        const parts = diffLines(section.originalText, section.modifiedText);
        return (
          <EuiFlexItem key={section.label}>
            <EuiText
              size="xs"
              color="subdued"
              className={css`
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 4px;
              `}
            >
              {section.label}
            </EuiText>
            <pre
              className={css`
                font-family: ${euiTheme.font.familyCode};
                font-size: 12px;
                white-space: pre-wrap;
                word-break: break-word;
                margin: 0;
                padding: 8px;
                background: ${euiTheme.colors.lightestShade};
                border-radius: ${euiTheme.border.radius.small};
              `}
            >
              {parts.map((part, idx) => (
                <span
                  key={idx}
                  className={css`
                    background: ${part.added
                      ? euiTheme.colors.success + '33'
                      : part.removed
                      ? euiTheme.colors.danger + '33'
                      : 'transparent'};
                    text-decoration: ${part.removed ? 'line-through' : 'none'};
                  `}
                >
                  {part.value}
                </span>
              ))}
            </pre>
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );
}

function CreateEntryFlyout({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { createEntry } = useMemoryMutations();
  const { data: treeData } = useMemoryTree();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [categories, setCategories] = useState<Array<EuiComboBoxOptionOption<string>>>([]);

  const categoryOptions = useMemo(() => {
    const paths = new Set<string>();
    const collect = (nodes: MemoryCategoryNode[]) => {
      for (const node of nodes) {
        paths.add(node.category);
        collect(node.children);
      }
    };
    collect(treeData?.tree ?? []);
    return Array.from(paths).map((p) => ({ label: p }));
  }, [treeData]);

  const handleCreate = useCallback(() => {
    if (!title.trim()) return;
    const name =
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '') || `entry_${Date.now()}`;
    createEntry.mutate(
      {
        name,
        title: title.trim(),
        content,
        tags: tags.map((t) => t.label),
        categories: categories.map((c) => c.label),
      },
      { onSuccess: (entry) => onCreated(entry.id) }
    );
  }, [title, content, tags, categories, createEntry, onCreated]);

  return (
    <EuiFlyout
      onClose={onClose}
      size="m"
      data-test-subj="streamsMemoryCreateFlyout"
      aria-label={i18n.translate('xpack.streams.memory.createFlyoutAriaLabel', {
        defaultMessage: 'Create memory entry',
      })}
    >
      <EuiFlyoutHeader hasBorder={false}>
        <EuiTitle size="m">
          <h2>
            {i18n.translate('xpack.streams.memory.createFlyoutTitle', {
              defaultMessage: 'New memory entry',
            })}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiFlexGroup direction="column" gutterSize="m">
          <EuiFlexItem>
            <EuiTitle size="xxs">
              <h4>
                {i18n.translate('xpack.streams.memory.titleLabel', { defaultMessage: 'Title' })}
              </h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiFieldText
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              data-test-subj="streamsMemoryCreateTitle"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xxs">
              <h4>
                {i18n.translate('xpack.streams.memory.contentLabel', {
                  defaultMessage: 'Content',
                })}
              </h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiTextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fullWidth
              rows={12}
              data-test-subj="streamsMemoryCreateContent"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xxs">
              <h4>
                {i18n.translate('xpack.streams.memory.categoriesLabel', {
                  defaultMessage: 'Categories',
                })}
              </h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiComboBox
              options={categoryOptions}
              selectedOptions={categories}
              onChange={setCategories}
              onCreateOption={(searchValue) =>
                setCategories((prev) => [...prev, { label: searchValue }])
              }
              isClearable
              fullWidth
              placeholder={i18n.translate('xpack.streams.memory.categoriesPlaceholder', {
                defaultMessage: 'e.g. infrastructure/kubernetes',
              })}
              data-test-subj="streamsMemoryCreateCategories"
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiTitle size="xxs">
              <h4>
                {i18n.translate('xpack.streams.memory.tagsLabel', { defaultMessage: 'Tags' })}
              </h4>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiComboBox
              options={[]}
              selectedOptions={tags}
              onChange={setTags}
              onCreateOption={(searchValue) => setTags((prev) => [...prev, { label: searchValue }])}
              isClearable
              fullWidth
              noSuggestions
              data-test-subj="streamsMemoryCreateTags"
            />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleCreate}
              isLoading={createEntry.isLoading}
              isDisabled={!title.trim()}
              data-test-subj="streamsMemoryCreateSaveButton"
            >
              {i18n.translate('xpack.streams.memory.createSaveButton', {
                defaultMessage: 'Create',
              })}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose}>
              {i18n.translate('xpack.streams.memory.cancelButton', { defaultMessage: 'Cancel' })}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}

const changeTypeIcons: Record<string, string> = {
  create: 'plusInCircle',
  update: 'pencil',
  delete: 'trash',
  rename: 'sortRight',
};

const changeTypeColors: Record<string, 'success' | 'primary' | 'danger' | 'warning'> = {
  create: 'success',
  update: 'primary',
  delete: 'danger',
  rename: 'warning',
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return i18n.translate('xpack.streams.memory.relativeTime.justNow', {
      defaultMessage: 'just now',
    });
  }
  if (diffMinutes < 60) {
    return i18n.translate('xpack.streams.memory.relativeTime.minutesAgo', {
      defaultMessage: '{minutes}m ago',
      values: { minutes: diffMinutes },
    });
  }
  if (diffHours < 24) {
    return i18n.translate('xpack.streams.memory.relativeTime.hoursAgo', {
      defaultMessage: '{hours}h ago',
      values: { hours: diffHours },
    });
  }
  if (diffDays < 7) {
    return i18n.translate('xpack.streams.memory.relativeTime.daysAgo', {
      defaultMessage: '{days}d ago',
      values: { days: diffDays },
    });
  }
  return date.toLocaleDateString();
};

function RecentChangeItem({
  change,
  onClick,
}: {
  change: MemoryVersionRecord;
  onClick: () => void;
}) {
  const { euiTheme } = useEuiTheme();
  const hoverBackground = transparentize(euiTheme.colors.primary, 0.05);

  return (
    <EuiPanel
      paddingSize="s"
      hasBorder
      hasShadow={false}
      onClick={onClick}
      className={css`
        cursor: pointer;
        &:hover {
          background-color: ${hoverBackground};
        }
      `}
    >
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiBadge
            color={changeTypeColors[change.change_type] ?? 'default'}
            iconType={changeTypeIcons[change.change_type] ?? 'dot'}
          >
            {change.change_type}
          </EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="xs">
            <strong>{change.title}</strong>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            {formatRelativeTime(change.created_at)}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      {change.change_summary && (
        <EuiText size="xs" color="subdued">
          {change.change_summary}
        </EuiText>
      )}
    </EuiPanel>
  );
}
