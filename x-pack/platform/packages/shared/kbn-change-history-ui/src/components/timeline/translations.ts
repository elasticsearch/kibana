/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const TIMELINE_ARIA_LABEL = i18n.translate('xpack.changeHistoryUi.timeline.ariaLabel', {
  defaultMessage: 'Change history timeline',
});

export const CURRENT_CHANGE_BADGE = i18n.translate(
  'xpack.changeHistoryUi.timeline.currentChangeBadge',
  {
    defaultMessage: 'Current version',
  }
);

export const N_CHANGES = (count: number): string =>
  i18n.translate('xpack.changeHistoryUi.timeline.nChanges', {
    defaultMessage: '{count, plural, one {# change} other {# changes}}',
    values: { count },
  });

export const NO_CHANGE_HISTORY_TITLE = i18n.translate('xpack.changeHistoryUi.timeline.emptyTitle', {
  defaultMessage: 'No changes have been recorded yet.',
});

export const NO_CHANGE_HISTORY_BODY = i18n.translate('xpack.changeHistoryUi.timeline.emptyBody', {
  defaultMessage: 'Subsequent edits will appear here.',
});

export const LOADING_LABEL = i18n.translate('xpack.changeHistoryUi.timeline.loadingLabel', {
  defaultMessage: 'Loading change history',
});

export const COMMENT_TOGGLE_ARIA_LABEL = i18n.translate(
  'xpack.changeHistoryUi.timeline.commentToggleAriaLabel',
  {
    defaultMessage: 'Toggle change comment',
  }
);

export const MODAL_TITLE = i18n.translate('xpack.changeHistoryUi.modal.title', {
  defaultMessage: 'Change history',
});

export const BACK_TO_HOST = i18n.translate('xpack.changeHistoryUi.modal.backToHost', {
  defaultMessage: 'Back',
});

export const CLOSE_MODAL = i18n.translate('xpack.changeHistoryUi.modal.close', {
  defaultMessage: 'Close change history',
});

export const SELECT_CHANGE_PROMPT = i18n.translate(
  'xpack.changeHistoryUi.modal.selectChangePrompt',
  {
    defaultMessage: 'Select a change to preview it',
  }
);

export const TRIGGER_LABEL = i18n.translate('xpack.changeHistoryUi.modal.triggerLabel', {
  defaultMessage: 'Change history',
});

export const HISTORY_LIST_ITEM_LABEL = i18n.translate(
  'xpack.changeHistoryUi.modal.historyListItemLabel',
  {
    defaultMessage: 'History',
  }
);

export const TIMELINE_PANEL_TITLE = i18n.translate(
  'xpack.changeHistoryUi.modal.timelinePanelTitle',
  {
    defaultMessage: 'Version history',
  }
);

export const PREVIEW_LOADING = i18n.translate('xpack.changeHistoryUi.modal.previewLoading', {
  defaultMessage: 'Loading change preview',
});

export const PREVIEW_ERROR = i18n.translate('xpack.changeHistoryUi.modal.previewError', {
  defaultMessage: 'Unable to load change preview',
});

export const LIST_ERROR = i18n.translate('xpack.changeHistoryUi.modal.listError', {
  defaultMessage: 'Unable to load change history',
});
