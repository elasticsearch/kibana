/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { isEqual } from 'lodash';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiMarkdownFormat,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useMemoryEntry, useMemoryMutations } from './use_memory';
import { HistoryPanel } from './history_panel';
import { EntryFormFields } from './entry_form';
import { useCategoryOptions } from './use_category_options';

type FlyoutTab = 'content' | 'history';

function DeleteEntryModal({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <EuiConfirmModal
      aria-label={i18n.translate('xpack.streams.memory.deleteConfirmAriaLabel', {
        defaultMessage: 'Confirm delete memory entry',
      })}
      title={i18n.translate('xpack.streams.memory.deleteConfirmTitle', {
        defaultMessage: 'Delete memory entry',
      })}
      onCancel={onCancel}
      onConfirm={onConfirm}
      cancelButtonText={i18n.translate('xpack.streams.memory.deleteConfirmCancel', {
        defaultMessage: 'Cancel',
      })}
      confirmButtonText={i18n.translate('xpack.streams.memory.deleteConfirmButton', {
        defaultMessage: 'Delete',
      })}
      buttonColor="danger"
    >
      {i18n.translate('xpack.streams.memory.deleteConfirmBody', {
        defaultMessage: 'Are you sure you want to delete "{title}"? This action cannot be undone.',
        values: { title },
      })}
    </EuiConfirmModal>
  );
}

function DiscardChangesModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <EuiConfirmModal
      aria-label={i18n.translate('xpack.streams.memory.discardConfirmAriaLabel', {
        defaultMessage: 'Confirm discard changes',
      })}
      title={i18n.translate('xpack.streams.memory.discardConfirmTitle', {
        defaultMessage: 'Discard unsaved changes?',
      })}
      onCancel={onCancel}
      onConfirm={onConfirm}
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
  );
}

export function EntryFlyout({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data: entry, isLoading } = useMemoryEntry(entryId);
  const { updateEntry, deleteEntry } = useMemoryMutations();
  const [activeTab, setActiveTab] = useState<FlyoutTab>('content');
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategories, setEditCategories] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [editTags, setEditTags] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDiscardModal, setShowDiscardModal] = useState(false);

  const categoryOptions = useCategoryOptions();

  const isDirty =
    isEditing &&
    !!entry &&
    !isEqual(
      {
        title: entry.title,
        content: entry.content,
        categories: entry.categories,
        tags: entry.tags,
      },
      {
        title: editTitle,
        content: editContent,
        categories: editCategories.map((c) => c.label),
        tags: editTags.map((t) => t.label),
      }
    );

  const handleEdit = useCallback(() => {
    if (entry) {
      setEditTitle(entry.title);
      setEditContent(entry.content);
      setEditCategories(entry.categories.map((cat) => ({ label: cat })));
      setEditTags(entry.tags.map((tag) => ({ label: tag })));
      setIsEditing(true);
    }
  }, [entry]);

  const handleSave = useCallback(() => {
    if (!entry) return;
    const categoryLabels = editCategories.map((c) => c.label);
    const tagLabels = editTags.map((t) => t.label);
    if (!isDirty) {
      setIsEditing(false);
      return;
    }
    updateEntry.mutate(
      {
        id: entry.id,
        ...(editTitle !== entry.title ? { title: editTitle } : {}),
        ...(editContent !== entry.content ? { content: editContent } : {}),
        categories: categoryLabels,
        tags: tagLabels,
        change_summary: 'Manual edit via UI',
      },
      { onSuccess: () => setIsEditing(false) }
    );
  }, [entry, isDirty, editTitle, editContent, editCategories, editTags, updateEntry]);

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
        <EuiFlyoutHeader hasBorder={false}>
          {isLoading ? (
            <EuiLoadingSpinner size="l" />
          ) : entry ? (
            <>
              <EuiTitle size="m">
                <h2>{entry.title}</h2>
              </EuiTitle>
              {entry.categories.length > 0 && (
                <EuiText size="xs" color="subdued">
                  {entry.categories.join(' · ')}
                </EuiText>
              )}
              <EuiSpacer size="xs" />
              <EuiText size="xs" color="subdued">
                {i18n.translate('xpack.streams.memory.entryMeta', {
                  defaultMessage:
                    'v{version} · Created by {createdBy} · Updated {updatedAt} by {updatedBy}',
                  values: {
                    version: entry.version,
                    createdBy: entry.created_by,
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
          <EuiSpacer size="s" />
          <EuiTabs size="s">
            <EuiTab isSelected={activeTab === 'content'} onClick={() => setActiveTab('content')}>
              {i18n.translate('xpack.streams.memory.contentTab', { defaultMessage: 'Content' })}
            </EuiTab>
            <EuiTab
              isSelected={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              disabled={isEditing}
            >
              {i18n.translate('xpack.streams.memory.historyTab', { defaultMessage: 'History' })}
            </EuiTab>
          </EuiTabs>
        </EuiFlyoutHeader>

        <EuiFlyoutBody>
          {entry && activeTab === 'content' && (
            <>
              {isEditing ? (
                <EntryFormFields
                  title={editTitle}
                  onTitleChange={setEditTitle}
                  content={editContent}
                  onContentChange={setEditContent}
                  categories={editCategories}
                  onCategoriesChange={setEditCategories}
                  tags={editTags}
                  onTagsChange={setEditTags}
                  categoryOptions={categoryOptions}
                  titleTestSubj="streamsMemoryEditTitle"
                  contentTestSubj="streamsMemoryEditArea"
                  categoriesTestSubj="streamsMemoryEditCategories"
                  tagsTestSubj="streamsMemoryEditTags"
                  contentRows={18}
                />
              ) : (
                <>
                  <EuiMarkdownFormat>{entry.content}</EuiMarkdownFormat>
                  {entry.tags.length > 0 && (
                    <>
                      <EuiSpacer size="m" />
                      <EuiFlexGroup gutterSize="xs" wrap>
                        {entry.tags.map((tag) => (
                          <EuiFlexItem key={tag} grow={false}>
                            <EuiBadge color="hollow">{tag}</EuiBadge>
                          </EuiFlexItem>
                        ))}
                      </EuiFlexGroup>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {entry && activeTab === 'history' && <HistoryPanel entryId={entryId} entry={entry} />}
        </EuiFlyoutBody>

        <EuiFlyoutFooter>
          {activeTab === 'content' &&
            (isEditing ? (
              <EuiFlexGroup gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButton
                    fill
                    onClick={handleSave}
                    isLoading={updateEntry.isLoading}
                    isDisabled={!editTitle.trim()}
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
            ) : (
              <EuiFlexGroup justifyContent="spaceBetween">
                <EuiFlexItem grow={false}>
                  <EuiButton
                    onClick={handleEdit}
                    size="s"
                    iconType="pencil"
                    isDisabled={!entry}
                    data-test-subj="streamsMemoryEditButton"
                  >
                    {i18n.translate('xpack.streams.memory.editButton', {
                      defaultMessage: 'Edit',
                    })}
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    color="danger"
                    onClick={() => setShowDeleteModal(true)}
                    size="s"
                    isDisabled={!entry}
                  >
                    {i18n.translate('xpack.streams.memory.deleteButton', {
                      defaultMessage: 'Delete',
                    })}
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
            ))}
        </EuiFlyoutFooter>
      </EuiFlyout>

      {showDeleteModal && entry && (
        <DeleteEntryModal
          title={entry.title}
          onCancel={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
        />
      )}

      {showDiscardModal && (
        <DiscardChangesModal
          onCancel={() => setShowDiscardModal(false)}
          onConfirm={handleConfirmDiscard}
        />
      )}
    </>
  );
}
