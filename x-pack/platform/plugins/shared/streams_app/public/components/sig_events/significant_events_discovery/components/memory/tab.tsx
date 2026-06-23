/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiFieldSearch,
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
import type { EuiBasicTableColumn } from '@elastic/eui';
import { css } from '@emotion/css';
import { i18n } from '@kbn/i18n';
import { CODE_EDITOR_DEFAULT_THEME_ID, defaultThemesResolvers, monaco } from '@kbn/monaco';
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
    if (!treeData?.tree) return [];
    return toTreeItems(treeData.tree, setSelectedEntryId);
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
  const { updateEntry, deleteEntry } = useMemoryMutations();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const handleEdit = useCallback(() => {
    if (entry) {
      setEditContent(entry.content);
      setIsEditing(true);
    }
  }, [entry]);

  const handleSave = useCallback(() => {
    if (entry && editContent !== entry.content) {
      updateEntry.mutate(
        { id: entry.id, content: editContent, change_summary: 'Manual edit via UI' },
        { onSuccess: () => setIsEditing(false) }
      );
    } else {
      setIsEditing(false);
    }
  }, [entry, editContent, updateEntry]);

  const handleDelete = useCallback(() => {
    if (entry) {
      deleteEntry.mutate(entry.id, { onSuccess: onClose });
    }
  }, [entry, deleteEntry, onClose]);

  const handleClose = useCallback(() => {
    if (isEditing && entry && editContent !== entry.content) {
      setShowDiscardModal(true);
    } else {
      onClose();
    }
  }, [isEditing, entry, editContent, onClose]);

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
                  originalContent={previousRecord?.content ?? ''}
                  modifiedContent={selectedRecord.content}
                />
              </>
            )}
          </>
        )}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
}

function MemoryDiffViewer({
  originalContent,
  modifiedContent,
}: {
  originalContent: string;
  modifiedContent: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IDiffEditor | null>(null);
  const euiTheme = useEuiTheme();

  useLayoutEffect(() => {
    if (!wrapperRef.current) return;

    const oldModel = monaco.editor.createModel(originalContent, 'markdown');
    const newModel = monaco.editor.createModel(modifiedContent, 'markdown');

    if (!editorRef.current) {
      editorRef.current = monaco.editor.createDiffEditor(wrapperRef.current, {
        automaticLayout: true,
        theme: CODE_EDITOR_DEFAULT_THEME_ID,
      });
    }

    editorRef.current.setModel({ original: oldModel, modified: newModel });

    const commonOptions: monaco.editor.IEditorOptions = {
      fontSize: 12,
      lineNumbers: 'off',
      minimap: { enabled: false },
      overviewRulerBorder: false,
      readOnly: true,
      scrollbar: {
        alwaysConsumeMouseWheel: false,
        useShadows: false,
      },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      wrappingIndent: 'indent',
      renderLineHighlight: 'none',
      contextmenu: false,
    };

    editorRef.current.updateOptions({
      ...commonOptions,
      renderSideBySide: false,
    });
    editorRef.current.getOriginalEditor().updateOptions(commonOptions);
    editorRef.current.getModifiedEditor().updateOptions(commonOptions);

    return () => {
      oldModel.dispose();
      newModel.dispose();
    };
  }, [originalContent, modifiedContent]);

  useEffect(() => {
    Object.entries(defaultThemesResolvers).forEach(([themeId, themeResolver]) => {
      monaco.editor.defineTheme(themeId, themeResolver(euiTheme));
    });
  }, [euiTheme]);

  useEffect(() => {
    return () => {
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      data-test-subj="streamsMemoryDiffViewer"
      className={css`
        width: 100%;
        height: 400px;
      `}
    />
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
