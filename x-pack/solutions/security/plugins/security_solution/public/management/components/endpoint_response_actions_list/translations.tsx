/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const OUTPUT_MESSAGES = Object.freeze({
  hasExpired: (command: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.item.hasExpired', {
      defaultMessage: `{command} failed: action expired`,
      values: { command },
    }),
  wasSuccessful: (command: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.item.wasSuccessful', {
      defaultMessage: `{command} completed successfully`,
      values: { command },
    }),
  submittedSuccessfully: (command: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.item.submittedSuccessfully', {
      defaultMessage: `{command} submitted successfully`,
      values: { command },
    }),
  isPending: (command: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.item.isPending', {
      defaultMessage: `{command} is pending`,
      values: { command },
    }),
  hasFailed: (command: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.item.hasFailed', {
      defaultMessage: `{command} failed`,
      values: { command },
    }),
  expandSection: {
    placedAt: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.placedAt',
      {
        defaultMessage: 'Command placed',
      }
    ),
    input: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.input',
      {
        defaultMessage: 'Input',
      }
    ),
    output: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.output',
      {
        defaultMessage: 'Output',
      }
    ),
    startedAt: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.startedAt',
      {
        defaultMessage: 'Execution started on',
      }
    ),
    parameters: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.parameters',
      {
        defaultMessage: 'Parameters',
      }
    ),
    completedAt: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.completedAt',
      {
        defaultMessage: 'Execution completed',
      }
    ),
    comment: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.comment',
      {
        defaultMessage: 'Comment',
      }
    ),
    hostname: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.hostname',
      {
        defaultMessage: 'Hostname',
      }
    ),
    agentType: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.expandSection.agentType',
      {
        defaultMessage: 'Agent type',
      }
    ),
  },
});

export const TABLE_COLUMN_NAMES = Object.freeze({
  time: i18n.translate('xpack.securitySolution.responseActionsList.list.time', {
    defaultMessage: 'Time',
  }),
  command: i18n.translate('xpack.securitySolution.responseActionsList.list.command', {
    defaultMessage: 'Command',
  }),
  user: i18n.translate('xpack.securitySolution.responseActionsList.list.user', {
    defaultMessage: 'User',
  }),
  hosts: i18n.translate('xpack.securitySolution.responseActionsList.list.hosts', {
    defaultMessage: 'Hosts',
  }),
  comments: i18n.translate('xpack.securitySolution.responseActionsList.list.comments', {
    defaultMessage: 'Comments',
  }),
  status: i18n.translate('xpack.securitySolution.responseActionsList.list.status', {
    defaultMessage: 'Status',
  }),
  rule: i18n.translate('xpack.securitySolution.responseActionsList.list.rule', {
    defaultMessage: 'Rule',
  }),
  actions: i18n.translate('xpack.securitySolution.responseActionsList.list.actions', {
    defaultMessage: 'Actions',
  }),
});

export const UX_MESSAGES = Object.freeze({
  flyoutTitle: (hostname: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.flyout.title', {
      defaultMessage: `Response actions history : {hostname}`,
      values: { hostname },
    }),
  pageSubTitle: i18n.translate('xpack.securitySolution.responseActionsList.list.pageSubTitle', {
    defaultMessage: 'View the history of response actions performed on hosts.',
  }),
  fetchError: i18n.translate('xpack.securitySolution.responseActionsList.list.errorMessage', {
    defaultMessage: 'Error while retrieving response actions',
  }),
  filterClearAll: i18n.translate(
    'xpack.securitySolution.responseActionsList.list.filter.clearAll',
    {
      defaultMessage: 'Clear all',
    }
  ),
  filterSearchPlaceholder: (filterName: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.filter.searchPlaceholder', {
      defaultMessage: 'Search {filterName}',
      values: { filterName },
    }),
  filterEmptyMessage: (filterName: string) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.filter.emptyMessage', {
      defaultMessage: 'No {filterName} available',
      values: { filterName },
    }),
  badge: {
    successful: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.badge.successful',
      {
        defaultMessage: 'Successful',
      }
    ),
    failed: i18n.translate('xpack.securitySolution.responseActionsList.list.item.badge.failed', {
      defaultMessage: 'Failed',
    }),
    pending: i18n.translate('xpack.securitySolution.responseActionsList.list.item.badge.pending', {
      defaultMessage: 'Pending',
    }),
    canceled: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.badge.canceled',
      {
        defaultMessage: 'Canceled',
      }
    ),
  },
  unenrolled: {
    hosts: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.hosts.unenrolled.hosts',
      {
        defaultMessage: 'Hosts unenrolled',
      }
    ),
    host: i18n.translate(
      'xpack.securitySolution.responseActionsList.list.item.hosts.unenrolled.host',
      {
        defaultMessage: 'Host name unavailable',
      }
    ),
  },
  screenReaderExpand: i18n.translate(
    'xpack.securitySolution.responseActionsList.list.screenReader.expand',
    {
      defaultMessage: 'Expand rows',
    }
  ),
  recordsLabel: (totalItemCount: number) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.recordRangeLabel', {
      defaultMessage: '{records, plural, one {response action} other {response actions}}',
      values: {
        records: totalItemCount,
      },
    }),
  triggeredByRule: i18n.translate(
    'xpack.securitySolution.responseActionsList.list.rule.triggeredByRule',
    {
      defaultMessage: 'Triggered by rule',
    }
  ),
  cancelAction: i18n.translate('xpack.securitySolution.responseActionsList.action.cancelAction', {
    defaultMessage: 'Cancel',
  }),
  cancelActionNotSupportedTooltip: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionNotSupportedTooltip',
    {
      defaultMessage: 'Cancellation is not supported for this action type',
    }
  ),
  cancelActionNotPermittedTooltip: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionNotPermittedTooltip',
    {
      defaultMessage: 'You do not have permission to cancel this action',
    }
  ),
  cancelActionModalTitle: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalTitle',
    {
      defaultMessage: 'Cancel action',
    }
  ),
  cancelActionModalSubmitButonLabel: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalSubmitButtonLabel',
    { defaultMessage: 'Submit' }
  ),
  cancelActionModalActionAlreadyComplete: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalActionAlreadyComplete',
    {
      defaultMessage: 'Action is already complete',
    }
  ),
  cancelActionModalCommentFieldPlaceholder: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalCommentFieldPlaceholder',
    {
      defaultMessage: 'Optional',
    }
  ),
  cancelActionModalAgentSelectorLabel: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalAgentSelectorLabel',
    {
      defaultMessage: 'Select agents',
    }
  ),
  cancelActionModalHostSelectorLabel: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalHostSelectorLabel',
    {
      defaultMessage: 'Select hosts',
    }
  ),
  cancelActionModalCommentLabel: i18n.translate(
    'xpack.securitySolution.responseActionsList.action.cancelActionModalCommentLabel',
    {
      defaultMessage: 'Comment',
    }
  ),
  cancelActionModalHostSelectorCounter: (selected: number, total: number) =>
    i18n.translate(
      'xpack.securitySolution.responseActionsList.action.cancelActionModalHostSelectorCounter',
      { defaultMessage: '{selected} of {total}', values: { selected, total } }
    ),
});

export const FILTER_NAMES = Object.freeze({
  actions: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.actions', {
    defaultMessage: 'Actions',
  }),
  actionTypes: i18n.translate(
    'xpack.securitySolution.responseActionsList.list.filter.actionTypes',
    {
      defaultMessage: 'Action types',
    }
  ),
  agentTypes: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.agentTypes', {
    defaultMessage: 'Agent types',
  }),
  hosts: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.Hosts', {
    defaultMessage: 'Hosts',
  }),
  statuses: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.statuses', {
    defaultMessage: 'Statuses',
  }),
  users: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.users', {
    defaultMessage: 'Filter by username',
  }),
  types: (countOfTypes: number) =>
    i18n.translate('xpack.securitySolution.responseActionsList.list.filter.types', {
      defaultMessage: `{countOfTypes, plural, one {Type} other {Types}}`,
      values: { countOfTypes },
    }),
  // replace above with:
  // types: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.types', {
  //   defaultMessage: 'Types',
  // }),
});

export const ARIA_LABELS = Object.freeze({
  collapse: i18n.translate(
    'xpack.securitySolution.responseActionsList.list.expandButton.collapse',
    {
      defaultMessage: 'Collapse',
    }
  ),
  expand: i18n.translate('xpack.securitySolution.responseActionsList.list.expandButton.expand', {
    defaultMessage: 'Expand',
  }),
});

export const EXECUTE_FILE_LINK_TITLE = i18n.translate(
  'xpack.securitySolution.responseActionExecuteDownloadLink.downloadButtonLabel',
  { defaultMessage: 'Click here to download full output' }
);

export const FILTER_TYPE_OPTIONS = Object.freeze({
  manual: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.manual', {
    defaultMessage: 'Triggered manually',
  }),
  automated: i18n.translate('xpack.securitySolution.responseActionsList.list.filter.automated', {
    defaultMessage: 'Triggered by rule',
  }),
});
