/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiTitle,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useMemoryMutations } from './use_memory';
import { EntryFormFields } from './entry_form';
import { useCategoryOptions } from './use_category_options';

export function CreateEntryFlyout({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { createEntry } = useMemoryMutations();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<Array<EuiComboBoxOptionOption<string>>>([]);
  const [categories, setCategories] = useState<Array<EuiComboBoxOptionOption<string>>>([]);

  const categoryOptions = useCategoryOptions();

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
        <EntryFormFields
          title={title}
          onTitleChange={setTitle}
          content={content}
          onContentChange={setContent}
          categories={categories}
          onCategoriesChange={setCategories}
          tags={tags}
          onTagsChange={setTags}
          categoryOptions={categoryOptions}
          titleTestSubj="streamsMemoryCreateTitle"
          contentTestSubj="streamsMemoryCreateContent"
          categoriesTestSubj="streamsMemoryCreateCategories"
          tagsTestSubj="streamsMemoryCreateTags"
          contentRows={12}
        />
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
