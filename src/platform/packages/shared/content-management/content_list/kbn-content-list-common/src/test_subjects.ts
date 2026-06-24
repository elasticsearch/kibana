/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Canonical `data-test-subj` values emitted by the `@kbn/content-list` UI
 * framework (table, toolbar, filters, selection bar, provider dialogs, layout).
 *
 * This is the single source of truth shared by the components that render these
 * subjects and the test helpers that target them. Cross-plugin suites drive
 * listing pages they don't own at run time, so a `TableListView` ->
 * `@kbn/content-list` migration in one plugin can break those suites if the
 * subjects drift — selective testing doesn't schedule them
 * (see {@link https://github.com/elastic/kibana/pull/270044}). Keeping the
 * literals here means a component and its consumers can't diverge silently.
 */
export const CONTENT_LIST_TEST_SUBJECTS = {
  // Table — `@kbn/content-list-table`.
  table: 'content-list-table',
  tableSkeleton: 'content-list-table-skeleton',
  itemLink: 'content-list-table-item-link',
  columnName: 'content-list-table-column-name',
  columnActions: 'content-list-table-column-actions',
  columnStarred: 'content-list-table-column-starred',
  columnUpdatedAt: 'content-list-table-column-updatedAt',
  columnCreatedBy: 'content-list-table-column-createdBy',
  actionEdit: 'content-list-table-action-edit',
  actionDelete: 'content-list-table-action-delete',
  actionInspect: 'content-list-table-action-inspect',
  createdByManaged: 'content-list-createdBy-managed',
  createdByNoCreator: 'content-list-createdBy-noCreator',
  createdByAvatar: 'content-list-createdBy-avatar',

  // Layout — `@kbn/content-list`.
  defaultEmptyState: 'content-list-default-empty-state',

  // Toolbar — `@kbn/content-list-toolbar`.
  toolbar: 'contentListToolbar',
  toolbarSkeleton: 'contentListToolbar-skeleton',
  tagsFilter: 'contentListTagsRenderer',
  sortFilter: 'contentListSortRenderer',
  sortSelectOptions: 'sortSelectOptions',
  createdByFilter: 'contentListCreatedByRenderer',
  starredFilter: 'contentListStarredRenderer',
  selectionBar: 'contentListSelectionBar',

  // Delete dialogs — `@kbn/content-list-provider`.
  deleteConfirmation: 'contentListDeleteConfirmation',
  deleteConfirmationCloseButton: 'contentListDeleteConfirmation-closeButton',
  deleteConfirmationSkippedCallout: 'contentListDeleteConfirmation-skippedCallout',
  deleteConfirmationSkippedList: 'contentListDeleteConfirmation-skippedList',
  deleteError: 'contentListDeleteError',
} as const;

/** Per-row subject for the table item with `id` (`itemId` on the table). */
export const getContentListRowSubj = (id: string): string => `content-list-table-row-${id}`;

/**
 * Subject for a tag option in the tags filter popover, keyed by tag *name* to
 * match the legacy `TableListView` panel (`testSubjFriendly`) and the
 * `@kbn/content-list-scout` helper. The first space is replaced with `_`,
 * mirroring the legacy normalization so cross-plugin suites resolve the same
 * subject regardless of which framework an app has adopted.
 */
export const getContentListTagOptionSubj = (name: string): string =>
  `tag-searchbar-option-${name.replace(' ', '_')}`;

/**
 * Subjects the toolbar composes from its root `data-test-subj`. Defaults to
 * {@link CONTENT_LIST_TEST_SUBJECTS.toolbar}; pass a custom root when the
 * toolbar is rendered with an overridden `data-test-subj`.
 */
export const getContentListToolbarSubjects = (root: string = CONTENT_LIST_TEST_SUBJECTS.toolbar) =>
  ({
    root,
    searchBox: `${root}-searchBox`,
    searchParseError: `${root}-searchParseError`,
    selectionBar: `${root}-selectionBar`,
    skeleton: `${root}-skeleton`,
  } as const);

/**
 * Subjects the selection bar composes from its root `data-test-subj`. Defaults
 * to {@link CONTENT_LIST_TEST_SUBJECTS.selectionBar}; the toolbar renders it
 * with `${toolbar}-selectionBar`, so its delete button resolves to
 * `contentListToolbar-selectionBar-deleteButton`.
 */
export const getContentListSelectionBarSubjects = (
  root: string = CONTENT_LIST_TEST_SUBJECTS.selectionBar
) =>
  ({
    root,
    deleteButton: `${root}-deleteButton`,
  } as const);
