/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const PAGE_TITLE = i18n.translate('xpack.inbox.actionsPage.title', {
  defaultMessage: 'Inbox',
});

export const PAGE_DESCRIPTION = i18n.translate('xpack.inbox.actionsPage.description', {
  defaultMessage:
    'Review and action items that agents across Kibana have paused for human approval.',
});

export const COLUMN_TITLE = i18n.translate('xpack.inbox.actionsPage.column.title', {
  defaultMessage: 'Action',
});

export const COLUMN_STATUS = i18n.translate('xpack.inbox.actionsPage.column.status', {
  defaultMessage: 'Status',
});

export const COLUMN_SOURCE = i18n.translate('xpack.inbox.actionsPage.column.source', {
  defaultMessage: 'Source',
});

export const COLUMN_REQUESTED_BY = i18n.translate('xpack.inbox.actionsPage.column.requestedBy', {
  defaultMessage: 'Requested by',
});

export const COLUMN_CREATED_AT = i18n.translate('xpack.inbox.actionsPage.column.createdAt', {
  defaultMessage: 'Created',
});

export const STATUS_PENDING = i18n.translate('xpack.inbox.actionsPage.status.pending', {
  defaultMessage: 'Pending',
});

export const STATUS_APPROVED = i18n.translate('xpack.inbox.actionsPage.status.approved', {
  defaultMessage: 'Approved',
});

export const STATUS_REJECTED = i18n.translate('xpack.inbox.actionsPage.status.rejected', {
  defaultMessage: 'Rejected',
});

export const EMPTY_TITLE = i18n.translate('xpack.inbox.actionsPage.empty.title', {
  defaultMessage: 'No inbox actions',
});

export const EMPTY_BODY = i18n.translate('xpack.inbox.actionsPage.empty.body', {
  defaultMessage: 'Agents will drop approval requests here when they need a human to weigh in.',
});

export const LOAD_ERROR_TITLE = i18n.translate('xpack.inbox.actionsPage.loadError.title', {
  defaultMessage: 'Unable to load inbox actions',
});

export const RETRY_BUTTON = i18n.translate('xpack.inbox.actionsPage.retryButton', {
  defaultMessage: 'Retry',
});

export const TABLE_CAPTION = i18n.translate('xpack.inbox.actionsPage.tableCaption', {
  defaultMessage: 'Inbox actions awaiting review',
});

export const getLoadErrorBody = (error: string) =>
  i18n.translate('xpack.inbox.actionsPage.loadError.body', {
    defaultMessage: 'Something went wrong while fetching inbox actions: {error}',
    values: { error },
  });

export const COLUMN_ACTIONS = i18n.translate('xpack.inbox.actionsPage.column.actions', {
  defaultMessage: 'Actions',
});

export const RESPOND_ACTION_LABEL = i18n.translate('xpack.inbox.actionsPage.respondAction', {
  defaultMessage: 'Respond',
});

export const RESPOND_ACTION_DESCRIPTION = i18n.translate(
  'xpack.inbox.actionsPage.respondActionDescription',
  {
    defaultMessage: 'Open the response form for this action',
  }
);

export const FLYOUT_TITLE = i18n.translate('xpack.inbox.actionsPage.flyout.title', {
  defaultMessage: 'Respond to action',
});

export const FLYOUT_SUBMIT = i18n.translate('xpack.inbox.actionsPage.flyout.submit', {
  defaultMessage: 'Submit',
});

export const FLYOUT_CANCEL = i18n.translate('xpack.inbox.actionsPage.flyout.cancel', {
  defaultMessage: 'Cancel',
});

export const FLYOUT_NO_SCHEMA_BODY = i18n.translate('xpack.inbox.actionsPage.flyout.noSchemaBody', {
  defaultMessage:
    'This action does not declare an input schema. Submitting will send an empty response.',
});

export const getFlyoutSubmitErrorMessage = (error: string) =>
  i18n.translate('xpack.inbox.actionsPage.flyout.submitError', {
    defaultMessage: 'Failed to submit response: {error}',
    values: { error },
  });

export const FLYOUT_SUBMIT_SUCCESS = i18n.translate(
  'xpack.inbox.actionsPage.flyout.submitSuccess',
  {
    defaultMessage: 'Response submitted',
  }
);

export const REQUIRED_FIELD_ERROR = i18n.translate('xpack.inbox.actionsPage.requiredFieldError', {
  defaultMessage: 'This field is required',
});

export const SELECT_PLACEHOLDER = i18n.translate('xpack.inbox.actionsPage.selectPlaceholder', {
  defaultMessage: 'Select a value',
});

export const TIMEOUT_EXPIRED_LABEL = i18n.translate('xpack.inbox.actionsPage.timeoutChip.expired', {
  defaultMessage: 'Timed out',
});

export const getTimeoutRemainingLabel = (remaining: string) =>
  i18n.translate('xpack.inbox.actionsPage.timeoutChip.remaining', {
    defaultMessage: 'Timeout in {remaining}',
    values: { remaining },
  });

export const getTimedOutBannerText = (timestamp: string) =>
  i18n.translate('xpack.inbox.actionsPage.timedOutBanner', {
    defaultMessage:
      'This action timed out on {timestamp}. The default response was applied automatically.',
    values: { timestamp },
  });

export const PENDING_SECTION_TITLE = i18n.translate(
  'xpack.inbox.actionsPage.pendingSection.title',
  {
    defaultMessage: 'Awaiting response',
  }
);

export const HISTORY_SECTION_TITLE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.title',
  {
    defaultMessage: 'History',
  }
);

export const HISTORY_SECTION_DESCRIPTION = i18n.translate(
  'xpack.inbox.actionsPage.historySection.description',
  {
    defaultMessage: 'Audit trail of inbox actions that have already been processed.',
  }
);

export const HISTORY_EMPTY_TITLE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.empty.title',
  {
    defaultMessage: 'No processed actions yet',
  }
);

export const HISTORY_EMPTY_BODY = i18n.translate(
  'xpack.inbox.actionsPage.historySection.empty.body',
  {
    defaultMessage: 'Once a responder approves or rejects an inbox action, it will show up here.',
  }
);

export const HISTORY_FILTERED_EMPTY_TITLE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filteredEmpty.title',
  {
    defaultMessage: 'No history matches your filters',
  }
);

export const HISTORY_FILTERED_EMPTY_BODY = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filteredEmpty.body',
  {
    defaultMessage: 'Try changing your search, responder, or channel filters.',
  }
);

export const HISTORY_LOAD_ERROR_TITLE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.loadError.title',
  {
    defaultMessage: 'Unable to load inbox history',
  }
);

export const getHistoryLoadErrorBody = (error: string) =>
  i18n.translate('xpack.inbox.actionsPage.historySection.loadError.body', {
    defaultMessage: 'Something went wrong while fetching the inbox history: {error}',
    values: { error },
  });

export const HISTORY_SYSTEM_RESPONDER = i18n.translate(
  'xpack.inbox.actionsPage.historySection.systemResponder',
  {
    defaultMessage: 'system',
  }
);

export const HISTORY_CHANNEL_INBOX = i18n.translate(
  'xpack.inbox.actionsPage.historySection.channel.inbox',
  {
    defaultMessage: 'Inbox',
  }
);

export const HISTORY_CHANNEL_KIBANA_EXECUTION_VIEW = i18n.translate(
  'xpack.inbox.actionsPage.historySection.channel.kibanaExecutionView',
  {
    defaultMessage: 'Workflow execution',
  }
);

export const HISTORY_CHANNEL_AGENT_BUILDER = i18n.translate(
  'xpack.inbox.actionsPage.historySection.channel.agentBuilder',
  {
    defaultMessage: 'Agent Builder',
  }
);

export const HISTORY_CHANNEL_SLACK = i18n.translate(
  'xpack.inbox.actionsPage.historySection.channel.slack',
  {
    defaultMessage: 'Slack',
  }
);

export const HISTORY_CHANNEL_EXAMPLE_MCP_APP_SECURITY = i18n.translate(
  'xpack.inbox.actionsPage.historySection.channel.exampleMcpAppSecurity',
  {
    defaultMessage: 'Security MCP example',
  }
);

export const getHistoryChannelTooltip = (channel: string) =>
  i18n.translate('xpack.inbox.actionsPage.historySection.channelTooltip', {
    defaultMessage: 'Response submitted via {channel}',
    values: { channel },
  });

export const HISTORY_PROCESSING_BADGE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.processingBadge',
  {
    defaultMessage: 'Processing…',
  }
);

export const HISTORY_TIMED_OUT_BADGE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.timedOutBadge',
  {
    defaultMessage: 'Timed out',
  }
);

export const HISTORY_SOURCE_DELETED_BADGE = i18n.translate(
  'xpack.inbox.actionsPage.historySection.sourceDeletedBadge',
  {
    defaultMessage: 'Workflow deleted',
  }
);

export const HISTORY_SOURCE_DELETED_TOOLTIP = i18n.translate(
  'xpack.inbox.actionsPage.historySection.sourceDeletedTooltip',
  {
    defaultMessage:
      'The workflow that produced this action has been deleted. This audit record is retained.',
  }
);

export const HISTORY_PROMPT_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.historySection.promptLabel',
  {
    defaultMessage: 'Prompt',
  }
);

export const HISTORY_RESPONSE_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.historySection.responseLabel',
  {
    defaultMessage: 'Response',
  }
);

export const HISTORY_NO_RESPONSE_PAYLOAD = i18n.translate(
  'xpack.inbox.actionsPage.historySection.noResponsePayload',
  {
    defaultMessage: 'No response payload was recorded.',
  }
);

export const HISTORY_RESPONSE_PROCESSING_BODY = i18n.translate(
  'xpack.inbox.actionsPage.historySection.responseProcessingBody',
  {
    defaultMessage: 'Response payload is still being recorded.',
  }
);

export const HISTORY_FILTERS_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.searchPlaceholder',
  {
    defaultMessage: 'Search responder, workflow id, or step id…',
  }
);

export const HISTORY_FILTERS_SEARCH_ARIA_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.searchAriaLabel',
  {
    defaultMessage: 'Search inbox history',
  }
);

export const HISTORY_FILTERS_CHANNEL_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.channelLabel',
  {
    defaultMessage: 'Channel',
  }
);

export const HISTORY_FILTERS_CHANNEL_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.channelSearchPlaceholder',
  {
    defaultMessage: 'Search channels',
  }
);

export const HISTORY_FILTERS_RESPONDER_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.responderLabel',
  {
    defaultMessage: 'Responder',
  }
);

export const HISTORY_FILTERS_RESPONDER_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.responderSearchPlaceholder',
  {
    defaultMessage: 'Search responders',
  }
);

export const HISTORY_FILTERS_NO_OPTIONS = i18n.translate(
  'xpack.inbox.actionsPage.historySection.filters.noOptions',
  {
    defaultMessage: 'No options available yet.',
  }
);

export const HISTORY_SORT_NEWEST = i18n.translate(
  'xpack.inbox.actionsPage.historySection.sort.newest',
  {
    defaultMessage: 'Newest first',
  }
);

export const HISTORY_SORT_OLDEST = i18n.translate(
  'xpack.inbox.actionsPage.historySection.sort.oldest',
  {
    defaultMessage: 'Oldest first',
  }
);

export const REASONING_LABEL = i18n.translate('xpack.inbox.actionsPage.reasoning.label', {
  defaultMessage: 'Reasoning',
});

export const REASONING_FULL_LABEL = i18n.translate('xpack.inbox.actionsPage.reasoning.fullLabel', {
  defaultMessage: 'Full reasoning',
});

export const REASONING_EXPAND_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.reasoning.expandLabel',
  {
    defaultMessage: 'Show reasoning',
  }
);

export const REASONING_COLLAPSE_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.reasoning.collapseLabel',
  {
    defaultMessage: 'Hide reasoning',
  }
);

export const REASONING_COLUMN_SR_LABEL = i18n.translate(
  'xpack.inbox.actionsPage.reasoning.columnScreenReaderLabel',
  {
    defaultMessage: 'Expand row to show reasoning',
  }
);
