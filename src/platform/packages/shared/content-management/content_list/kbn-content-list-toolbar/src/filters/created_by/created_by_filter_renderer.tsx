/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { Query } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useContentListConfig, CREATED_BY_FILTER_ID } from '@kbn/content-list-provider';
import { CONTENT_LIST_TEST_SUBJECTS } from '@kbn/content-list-common';
import { UserFieldFilterRenderer } from '../user_field';

/**
 * Props for the {@link CreatedByFilterRenderer} component.
 *
 * When used with `EuiSearchBar` `custom_component` filters, the search bar passes
 * `query` and `onChange` props.
 */
export interface CreatedByFilterRendererProps {
  /** Query object from `EuiSearchBar`. */
  query?: Query;
  /** `onChange` callback from `EuiSearchBar`. */
  onChange?: (query: Query) => void;
  /** Optional `data-test-subj` attribute for testing. */
  'data-test-subj'?: string;
}

const i18nText = {
  title: i18n.translate('contentManagement.contentList.createdByRenderer.title', {
    defaultMessage: 'Created by',
  }),
  emptyMessage: i18n.translate('contentManagement.contentList.createdByRenderer.emptyMessage', {
    defaultMessage: "There aren't any users",
  }),
  noMatchesMessage: i18n.translate(
    'contentManagement.contentList.createdByRenderer.noMatchesMessage',
    { defaultMessage: 'No user matches the search' }
  ),
};

/**
 * `CreatedByFilterRenderer` component for `EuiSearchBar` `custom_component` filter.
 *
 * Thin wrapper around {@link UserFieldFilterRenderer} for the `createdBy` field.
 */
export const CreatedByFilterRenderer = ({
  query,
  onChange,
  'data-test-subj': dataTestSubj = CONTENT_LIST_TEST_SUBJECTS.createdByFilter,
}: CreatedByFilterRendererProps) => {
  const { supports } = useContentListConfig();

  if (!supports.userProfiles) {
    return null;
  }

  return (
    <UserFieldFilterRenderer
      fieldName={CREATED_BY_FILTER_ID}
      title={i18nText.title}
      query={query}
      onChange={onChange}
      emptyMessage={i18nText.emptyMessage}
      noMatchesMessage={i18nText.noMatchesMessage}
      data-test-subj={dataTestSubj}
    />
  );
};
