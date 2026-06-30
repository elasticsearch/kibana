/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiTextArea,
  EuiTitle,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

function FieldSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <EuiFlexItem>
      <EuiTitle size="xxs">
        <h4>{label}</h4>
      </EuiTitle>
      <EuiSpacer size="xs" />
      {children}
    </EuiFlexItem>
  );
}

export interface EntryFormFieldsProps {
  title: string;
  onTitleChange: (v: string) => void;
  content: string;
  onContentChange: (v: string) => void;
  categories: Array<EuiComboBoxOptionOption<string>>;
  onCategoriesChange: (v: Array<EuiComboBoxOptionOption<string>>) => void;
  tags: Array<EuiComboBoxOptionOption<string>>;
  onTagsChange: (v: Array<EuiComboBoxOptionOption<string>>) => void;
  categoryOptions: Array<EuiComboBoxOptionOption<string>>;
  titleTestSubj?: string;
  contentTestSubj?: string;
  categoriesTestSubj?: string;
  tagsTestSubj?: string;
  contentRows?: number;
}

export function EntryFormFields({
  title,
  onTitleChange,
  content,
  onContentChange,
  categories,
  onCategoriesChange,
  tags,
  onTagsChange,
  categoryOptions,
  titleTestSubj = 'streamsMemoryEditTitle',
  contentTestSubj = 'streamsMemoryEditArea',
  categoriesTestSubj = 'streamsMemoryEditCategories',
  tagsTestSubj = 'streamsMemoryEditTags',
  contentRows = 12,
}: EntryFormFieldsProps) {
  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      <FieldSection
        label={i18n.translate('xpack.streams.memory.titleLabel', { defaultMessage: 'Title' })}
      >
        <EuiFieldText
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          fullWidth
          data-test-subj={titleTestSubj}
        />
      </FieldSection>
      <FieldSection
        label={i18n.translate('xpack.streams.memory.contentLabel', {
          defaultMessage: 'Content',
        })}
      >
        <EuiTextArea
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          fullWidth
          rows={contentRows}
          data-test-subj={contentTestSubj}
        />
      </FieldSection>
      <FieldSection
        label={i18n.translate('xpack.streams.memory.categoriesLabel', {
          defaultMessage: 'Categories',
        })}
      >
        <EuiComboBox
          options={categoryOptions}
          selectedOptions={categories}
          onChange={onCategoriesChange}
          onCreateOption={(searchValue) =>
            onCategoriesChange([...categories, { label: searchValue }])
          }
          isClearable
          fullWidth
          placeholder={i18n.translate('xpack.streams.memory.categoriesPlaceholder', {
            defaultMessage: 'e.g. infrastructure/kubernetes',
          })}
          data-test-subj={categoriesTestSubj}
        />
      </FieldSection>
      <FieldSection
        label={i18n.translate('xpack.streams.memory.tagsLabel', { defaultMessage: 'Tags' })}
      >
        <EuiComboBox
          options={[]}
          selectedOptions={tags}
          onChange={onTagsChange}
          onCreateOption={(searchValue) => onTagsChange([...tags, { label: searchValue }])}
          isClearable
          fullWidth
          noSuggestions
          data-test-subj={tagsTestSubj}
        />
      </FieldSection>
    </EuiFlexGroup>
  );
}
