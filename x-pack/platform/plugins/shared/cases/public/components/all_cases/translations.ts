/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export * from '../../common/translations';
export * from '../user_profiles/translations';
export {
  OPEN as STATUS_OPEN,
  IN_PROGRESS as STATUS_IN_PROGRESS,
  CLOSED as STATUS_CLOSED,
} from '@kbn/cases-components/src/status/translations';

export const NO_CASES = i18n.translate('xpack.cases.caseTable.noCases.title', {
  defaultMessage: 'No cases to display',
});

export const NO_CASES_BODY = i18n.translate('xpack.cases.caseTable.noCases.body', {
  defaultMessage: 'Create a case or edit your filters.',
});

export const NO_CASES_BODY_READ_ONLY = i18n.translate(
  'xpack.cases.caseTable.noCases.readonly.body',
  {
    defaultMessage: 'Edit your filter settings.',
  }
);

export const SHOWING_SELECTED_CASES = (totalRules: number) =>
  i18n.translate('xpack.cases.caseTable.selectedCasesTitle', {
    values: { totalRules },
    defaultMessage: 'Selected {totalRules} {totalRules, plural, =1 {case} other {cases}}',
  });

export const SHOWING_CASES = (totalRules: number, pageSize: number) =>
  i18n.translate('xpack.cases.caseTable.showingCasesTitle', {
    values: { totalRules, pageSize },
    defaultMessage:
      'Showing {pageSize} of {totalRules} {totalRules, plural, =1 {case} other {cases}}',
  });

export const MAX_CASES = (maxCases: number) =>
  i18n.translate('xpack.cases.caseTable.maxCases', {
    values: { maxCases },
    defaultMessage:
      'The results were capped at {maxCases} to maintain performance. Try limiting your search to reduce the results.',
  });

export const SHOW_ALL_CASES = i18n.translate('xpack.cases.caseTable.showAllCases', {
  defaultMessage: 'Show all cases',
});

export const LAST_30_DAYS = i18n.translate('xpack.cases.caseTable.last30Days', {
  defaultMessage: 'Last 30 days',
});

export const CUSTOM_QUICK_SELECT_PANEL = i18n.translate('xpack.cases.caseTable.customQuickSelect', {
  defaultMessage: 'Custom quick select',
});

export const DISMISS = i18n.translate('xpack.cases.caseTable.dismiss', {
  defaultMessage: 'Dismiss',
});

export const NOT_SHOW_AGAIN = i18n.translate('xpack.cases.caseTable.notShowAgain', {
  defaultMessage: 'Do not show again',
});

export const UNIT = (totalCount: number) =>
  i18n.translate('xpack.cases.caseTable.unit', {
    values: { totalCount },
    defaultMessage: `{totalCount, plural, =1 {case} other {cases}}`,
  });

export const SEARCH_CASES = i18n.translate('xpack.cases.caseTable.searchAriaLabel', {
  defaultMessage: 'Search cases',
});

export const BULK_ACTIONS = i18n.translate('xpack.cases.caseTable.bulkActions', {
  defaultMessage: 'Bulk actions',
});

export const EXTERNAL_INCIDENT = i18n.translate('xpack.cases.caseTable.snIncident', {
  defaultMessage: 'External incident',
});

export const SEVERITY = i18n.translate('xpack.cases.caseTable.severity', {
  defaultMessage: 'Severity',
});

export const EXTENDED_FIELDS = i18n.translate('xpack.cases.caseTable.extendedFields', {
  defaultMessage: 'Extended fields',
});

export const INCIDENT_MANAGEMENT_SYSTEM = i18n.translate('xpack.cases.caseTable.incidentSystem', {
  defaultMessage: 'Incident management system',
});

export const SEARCH_PLACEHOLDER = i18n.translate('xpack.cases.caseTable.searchPlaceholder', {
  defaultMessage: 'Search cases',
});

export const SEARCH_PLACEHOLDER_TEMPLATES_V2 = i18n.translate(
  'xpack.cases.caseTable.searchPlaceholderTemplatesV2',
  {
    defaultMessage: 'Search by text, field label, or field:value',
  }
);

export const CLOSED = i18n.translate('xpack.cases.caseTable.closed', {
  defaultMessage: 'Closed',
});

export const SELECT = i18n.translate('xpack.cases.caseTable.select', {
  defaultMessage: 'Select',
});

export const ALREADY_ATTACHED = i18n.translate('xpack.cases.caseTable.alreadyAttached', {
  defaultMessage: 'Added',
  description:
    'In this context, "Added" is letting the user know that all of their selected alerts were previously added to the case in question, and the "Add to case" button is disabled',
});

export const REQUIRES_UPDATE = i18n.translate('xpack.cases.caseTable.requiresUpdate', {
  defaultMessage: ' requires update',
});

export const UP_TO_DATE = i18n.translate('xpack.cases.caseTable.upToDate', {
  defaultMessage: ' is up to date',
});
export const NOT_PUSHED = i18n.translate('xpack.cases.caseTable.notPushed', {
  defaultMessage: 'Not pushed',
});

export const REFRESH = i18n.translate('xpack.cases.caseTable.refreshTitle', {
  defaultMessage: 'Refresh',
});

export const PUSH_LINK_ARIA = (thirdPartyName: string): string =>
  i18n.translate('xpack.cases.caseTable.pushLinkAria', {
    values: { thirdPartyName },
    defaultMessage: 'click to view the incident on { thirdPartyName }.',
  });
export const STATUS = i18n.translate('xpack.cases.caseTable.status', {
  defaultMessage: 'Status',
});

export const CHANGE_STATUS = i18n.translate('xpack.cases.caseTable.changeStatus', {
  defaultMessage: 'Change status',
});

export const ATTC_STAT = i18n.translate('xpack.cases.casesStats.mttr', {
  defaultMessage: 'Average time to close',
});

export const ATTC_STAT_INFO_ARIA_LABEL = i18n.translate(
  'xpack.cases.casesStats.mttr.info.ariaLabel',
  {
    defaultMessage: 'More about average time to close',
  }
);

export const ATTC_DESCRIPTION = i18n.translate('xpack.cases.casesStats.mttrDescription', {
  defaultMessage: 'The average duration (from creation to closure) for your current cases',
});

export const FILTER_ASSIGNEES_ARIA_LABEL = i18n.translate(
  'xpack.cases.allCasesView.filterAssigneesAriaLabel',
  {
    defaultMessage: 'click to filter assignees',
  }
);

export const CLEAR_FILTERS = i18n.translate('xpack.cases.allCasesView.clearFilters', {
  defaultMessage: 'Clear filters',
});

export const TOTAL_ASSIGNEES_FILTERED = (total: number) =>
  i18n.translate('xpack.cases.allCasesView.totalFilteredUsers', {
    defaultMessage: '{total, plural, one {# filter} other {# filters}} selected',
    values: { total },
  });

export const NO_ASSIGNEES = i18n.translate(
  'xpack.cases.allCasesView.filterAssignees.noAssigneesLabel',
  {
    defaultMessage: 'No assignees',
  }
);

export const MAX_SELECTED_FILTER = (count: number, field: string) =>
  i18n.translate('xpack.cases.userProfile.maxSelectedAssigneesFilter', {
    defaultMessage: "You've selected the maximum number of {count} {field}",
    values: { count, field },
  });

export const SHOW_LESS = i18n.translate('xpack.cases.allCasesView.showLessAvatars', {
  defaultMessage: 'show less',
});

export const SHOW_MORE = (count: number) =>
  i18n.translate('xpack.cases.allCasesView.showMoreAvatars', {
    defaultMessage: '+{count} more',
    values: { count },
  });

export const NO_ATTACHMENTS_ADDED = i18n.translate(
  'xpack.cases.modal.attachments.noAttachmentsTitle',
  {
    defaultMessage: 'No attachments added to the case',
  }
);

export const COLUMNS = i18n.translate('xpack.cases.allCasesView.columnSelection', {
  defaultMessage: 'Columns',
});

export const SHOW_ALL = i18n.translate('xpack.cases.allCasesView.columnSelectionShowAll', {
  defaultMessage: 'Show All',
});

export const HIDE_ALL = i18n.translate('xpack.cases.allCasesView.columnSelectionHideAll', {
  defaultMessage: 'Hide All',
});

export const SEARCH = i18n.translate('xpack.cases.allCasesView.columnSelectionSearch', {
  defaultMessage: 'Search',
});

export const SEARCH_COLUMNS = i18n.translate(
  'xpack.cases.allCasesView.columnSelectionSearchColumns',
  {
    defaultMessage: 'Search Columns',
  }
);

export const DRAG_HANDLE = i18n.translate('xpack.cases.allCasesView.columnSelectionDragHandle', {
  defaultMessage: 'Drag Handle',
});

export const EMPTY_FILTER_MESSAGE = i18n.translate(
  'xpack.cases.tableFilters.useFilters.emptyMessage',
  {
    defaultMessage: 'No options',
  }
);

export const OPTIONS = (totalCount: number) =>
  i18n.translate('xpack.cases.tableFilters.useFilters.options', {
    defaultMessage: '{totalCount, plural, one {# option} other {# options}}',
    values: { totalCount },
  });

export const MORE_FILTERS_LABEL = i18n.translate('xpack.cases.tableFilters.moreFiltersLabel', {
  defaultMessage: 'More',
});

export const CLOSE_CASE_MODAL_TITLE = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.title',
  {
    defaultMessage: 'Select alert close reason',
  }
);

export const CLOSE_CASE_MODAL_REASON_LABEL = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reasonLabel',
  {
    defaultMessage: 'Reason for closing',
  }
);

export const CLOSE_CASE_MODAL_CONFIRM = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.confirmButtonLabel',
  {
    defaultMessage: 'Confirm and close case',
  }
);

export const CLOSE_CASE_MODAL_CLOSE_BUTTON = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.closeButtonLabel',
  {
    defaultMessage: 'Cancel',
  }
);

export const CLOSE_CASE_MODAL_REASON_SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reasonSearchPlaceholder',
  {
    defaultMessage: 'Reason for closing attached alerts',
  }
);

export const CLOSE_CASE_MODAL_DISCLAIMER = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.disclaimer',
  {
    defaultMessage: 'Alerts already closed will not be updated',
  }
);

export const CLOSE_CASE_MODAL_REASON_CLOSE_WITHOUT_REASON = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reason.closeWithoutReason',
  {
    defaultMessage: 'Close without reason',
  }
);

export const CLOSE_CASE_MODAL_REASON_DUPLICATE = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reason.duplicate',
  {
    defaultMessage: 'Duplicate',
  }
);

export const CLOSE_CASE_MODAL_REASON_FALSE_POSITIVE = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reason.falsePositive',
  {
    defaultMessage: 'False Positive',
  }
);

export const CLOSE_CASE_MODAL_REASON_TRUE_POSITIVE = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reason.truePositive',
  {
    defaultMessage: 'True positive',
  }
);

export const CLOSE_CASE_MODAL_REASON_BENIGN_POSITIVE = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reason.benignPositive',
  {
    defaultMessage: 'Benign positive',
  }
);

export const CLOSE_CASE_MODAL_REASON_OTHER = i18n.translate(
  'xpack.cases.allCasesView.closeCaseModal.reason.other',
  {
    defaultMessage: 'Other',
  }
);
