/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const TITLE = i18n.translate('xpack.cases.savedObjectAttachmentsTable.title', {
  defaultMessage: 'Title',
});

export const DATE_ADDED = i18n.translate('xpack.cases.savedObjectAttachmentsTable.dateAdded', {
  defaultMessage: 'Date added',
});

export const ATTACHED_BY = i18n.translate('xpack.cases.savedObjectAttachmentsTable.attachedBy', {
  defaultMessage: 'Attached by',
});

export const NO_ITEMS = i18n.translate('xpack.cases.savedObjectAttachmentsTable.noItems', {
  defaultMessage: 'No saved objects attached',
});

export const UNTITLED = i18n.translate('xpack.cases.savedObjectAttachments.untitled', {
  defaultMessage: 'Untitled',
});

export const TABLE_CAPTION = i18n.translate(
  'xpack.cases.savedObjectAttachmentsTable.tableCaption',
  {
    defaultMessage: 'Saved object attachments table',
  }
);

export const SHOWING_COUNT = (count: number) =>
  i18n.translate('xpack.cases.savedObjectAttachmentsTable.showingCount', {
    values: { count },
    defaultMessage: 'Showing {count, plural, one {# item} other {# items}}',
  });

// Attach-saved-object modal strings — i18n IDs are intentionally kept on the
// original `xpack.cases.caseView.attach.savedObjectModal.*` namespace so
// existing translations don't break when this file moves.

export const MODAL_TITLE = i18n.translate('xpack.cases.caseView.attach.savedObjectModal.title', {
  defaultMessage: 'Attach saved object',
});

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.searchPlaceholder',
  {
    defaultMessage: 'Search saved objects',
  }
);

export const FILTER_ALL = i18n.translate('xpack.cases.caseView.attach.savedObjectModal.filterAll', {
  defaultMessage: 'All',
});

export const FILTER_TYPE_LABEL = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.filterTypeLabel',
  {
    defaultMessage: 'Filter by type',
  }
);

export const FETCH_ERROR_TITLE = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.fetchErrorTitle',
  {
    defaultMessage: 'Failed to fetch saved objects',
  }
);

export const ATTACH_SUCCESS_TITLE = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.attachSuccessTitle',
  {
    defaultMessage: 'Attached saved object to case',
  }
);

export const ATTACH_ACTION = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.attachAction',
  {
    defaultMessage: 'Attach',
  }
);

export const ATTACHED_ACTION = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.attachedAction',
  {
    defaultMessage: 'Attached',
  }
);

export const NO_ITEMS_FOUND = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.noItemsFound',
  {
    defaultMessage: 'No saved objects found',
  }
);

export const SAVED_OBJECT_LIST_LABEL = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.savedObjectListLabel',
  {
    defaultMessage: 'Saved object results',
  }
);

export const UPDATED_AT_PREFIX = i18n.translate(
  'xpack.cases.caseView.attach.savedObjectModal.updatedAtPrefix',
  {
    defaultMessage: 'Updated',
  }
);

export const MORE_TAGS_BADGE = (count: number) =>
  i18n.translate('xpack.cases.caseView.attach.savedObjectModal.moreTagsBadge', {
    values: { count },
    defaultMessage: '+{count}',
  });

export const MORE_TAGS_ARIA = (count: number) =>
  i18n.translate('xpack.cases.caseView.attach.savedObjectModal.moreTagsAria', {
    values: { count },
    defaultMessage: '{count, plural, one {# more tag} other {# more tags}}',
  });
