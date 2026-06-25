/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { EuiTokensObject } from '@elastic/eui';

interface EuiValues {
  [key: string]: any;
}

export const getEuiContextMapping = (): EuiTokensObject => {
  return {
    'euiAccordionChildrenLoading.message': i18n.translate(
      'core.euiAccordionChildrenLoading.message',
      {
        defaultMessage: 'Loading',
      }
    ),
    'euiAutoRefresh.autoRefreshLabel': i18n.translate('core.euiAutoRefresh.autoRefreshLabel', {
      defaultMessage: 'Auto refresh',
    }),
    'euiAutoRefresh.buttonLabelOff': i18n.translate('core.euiAutoRefresh.buttonLabelOff', {
      defaultMessage: 'Auto refresh is off',
    }),
    'euiAutoRefresh.buttonLabelOn': ({ prettyInterval }: EuiValues) =>
      i18n.translate('core.euiAutoRefresh.buttonLabelOn', {
        defaultMessage: 'Auto refresh is on and set to {prettyInterval}',
        values: { prettyInterval },
      }),
    'euiBasicTable.selectAllRows': i18n.translate('core.euiBasicTable.selectAllRows', {
      defaultMessage: 'Select all rows',
      description: 'ARIA and displayed label on a checkbox to select all table rows',
    }),
    'euiBasicTable.selectThisRow': ({ index }: EuiValues) =>
      i18n.translate('core.euiBasicTable.selectThisRow', {
        defaultMessage: 'Select row {index}',
        values: { index },
        description: 'ARIA and displayed label on a checkbox to select a single table row',
      }),
    'euiBasicTable.tablePagination': ({ tableCaption }: EuiValues) =>
      i18n.translate('core.euiBasicTable.tablePagination', {
        defaultMessage: 'Pagination for table: {tableCaption}',
        values: { tableCaption },
        description: 'Screen reader text to describe the pagination controls',
      }),
    'euiBasicTable.noItemsMessage': i18n.translate('core.euiBasicTable.noItemsMessage', {
      defaultMessage: 'No items found',
    }),
    'euiBasicTable.deselectRows': i18n.translate('core.euiBasicTable.deselectRows', {
      defaultMessage: 'Deselect rows',
    }),
    'euiBasicTable.caption.itemCountPart.withTotalItemCount': ({
      itemCount,
      totalItemCount,
    }: EuiValues) =>
      i18n.translate('core.euiBasicTable.caption.itemCountPart.withTotalItemCount', {
        defaultMessage: 'Showing {itemCount} of {totalItemCount} data rows.',
        values: { itemCount, totalItemCount },
        description: 'Screen reader text to describe the shown item count and total item count.',
      }),
    'euiBasicTable.caption.paginationPart.withPageCount': ({ page, pageCount }: EuiValues) =>
      i18n.translate('core.euiBasicTable.caption.paginationPart.withPageCount', {
        defaultMessage: 'Page {page} of {pageCount}.',
        values: { page, pageCount },
        description: 'Screen reader text to describe the shown page and total page count.',
      }),
    'euiBasicTable.caption.tableName': i18n.translate('core.euiBasicTable.caption.tableName', {
      defaultMessage: 'Data table',
      description: 'Screen reader text to announce the table.',
    }),
    'euiBasicTable.caption.emptyState': i18n.translate('core.euiBasicTable.caption.emptyState', {
      defaultMessage: '(empty)',
      description: 'Screen reader text to announce the empty table.',
    }),
    'euiBottomBar.customScreenReaderAnnouncement': ({ landmarkHeading }: EuiValues) =>
      i18n.translate('core.euiBottomBar.customScreenReaderAnnouncement', {
        defaultMessage:
          'There is a new region landmark called {landmarkHeading} with page level controls at the end of the document.',
        values: { landmarkHeading },
        description:
          'Screen reader announcement that functionality is available in the page document',
      }),
    'euiBottomBar.screenReaderAnnouncement': i18n.translate(
      'core.euiBottomBar.screenReaderAnnouncement',
      {
        defaultMessage:
          'There is a new region landmark with page level controls at the end of the document.',
        description:
          'Screen reader announcement that functionality is available in the page document',
      }
    ),
    'euiBottomBar.screenReaderHeading': i18n.translate('core.euiBottomBar.screenReaderHeading', {
      defaultMessage: 'Page level controls',
      description: 'Screen reader announcement about heading controls',
    }),
    'euiBreadcrumb.popoverAriaLabel': i18n.translate('core.euiBreadcrumb.popoverAriaLabel', {
      defaultMessage: 'Clicking this button will toggle a popover dialog.',
    }),
    'euiBreadcrumb.collapsedBadge.ariaLabel': i18n.translate(
      'core.euiBreadcrumb.collapsedBadge.ariaLabel',
      {
        defaultMessage: 'See collapsed breadcrumbs',
      }
    ),
    'euiBreadcrumbs.nav.ariaLabel': i18n.translate('core.euiBreadcrumbs.nav.ariaLabel', {
      defaultMessage: 'Breadcrumbs',
      description: 'Label on the breadcrumbs nav element',
    }),
    'euiCallOut.dismissAriaLabel': i18n.translate('core.euiCallOut.dismissAriaLabel', {
      defaultMessage: 'Dismiss this callout',
    }),
    'euiCardSelect.select': i18n.translate('core.euiCardSelect.select', {
      defaultMessage: 'Select',
      description: 'Displayed button text when a card option can be selected.',
    }),
    'euiCardSelect.selected': i18n.translate('core.euiCardSelect.selected', {
      defaultMessage: 'Selected',
      description: 'Displayed button text when a card option is selected.',
    }),
    'euiCardSelect.unavailable': i18n.translate('core.euiCardSelect.unavailable', {
      defaultMessage: 'Unavailable',
      description: 'Displayed button text when a card option is unavailable.',
    }),
    'euiCodeBlockAnnotations.ariaLabel': ({ lineNumber }: EuiValues) =>
      i18n.translate('core.euiCodeBlockAnnotations.ariaLabel', {
        defaultMessage: 'Click to view a code annotation for line {lineNumber}',
        values: { lineNumber },
        description:
          'ARIA label for a button icon that toggles a popover annotation for a specific code line',
      }),
    'euiCodeBlockCopy.copy': i18n.translate('core.euiCodeBlockCopy.copy', {
      defaultMessage: 'Copy',
      description: 'ARIA label for a button that copies source code text to the clipboard',
    }),
    'euiCodeBlockFullScreen.fullscreenCollapse': i18n.translate(
      'core.euiCodeBlockFullScreen.fullscreenCollapse',
      {
        defaultMessage: 'Collapse',
        description: 'ARIA label for a button that exits fullscreen view',
      }
    ),
    'euiCodeBlockFullScreen.fullscreenExpand': i18n.translate(
      'core.euiCodeBlockFullScreen.fullscreenExpand',
      {
        defaultMessage: 'Expand',
        description: 'ARIA label for a button that enters fullscreen view',
      }
    ),
    'euiCollapsedItemActions.allActions': ({ index }: EuiValues) =>
      i18n.translate('core.euiCollapsedItemActions.allActions', {
        defaultMessage: 'All actions, row {index}',
        values: { index },
        description:
          'ARIA label for a button that is rendered on multiple table rows, that expands an actions menu',
      }),
    'euiCollapsedItemActions.allActionsTooltip': i18n.translate(
      'core.euiCollapsedItemActions.allActionsTooltip',
      {
        defaultMessage: 'All actions',
        description: 'Tooltip content describing a button that expands an actions menu',
      }
    ),
    'euiCollapsedItemActions.allActionsDisabled': i18n.translate(
      'core.euiCollapsedItemActions.allActionsDisabled',
      {
        defaultMessage: 'Individual item actions are disabled when rows are being selected.',
        description: 'Title content when the actions popover toggle is disabled',
      }
    ),
    'euiCollapsibleNavBeta.ariaLabel': i18n.translate('core.euiCollapsibleNavBeta.ariaLabel', {
      defaultMessage: 'Site menu',
    }),
    'euiCollapsedNavButton.ariaLabelButtonIcon': ({ title }: EuiValues) =>
      i18n.translate('core.euiCollapsedNavButton.ariaLabelButtonIcon', {
        defaultMessage: '{title}, quick navigation menu',
        values: { title },
      }),
    'euiCollapsibleNavButton.ariaLabelExpand': i18n.translate(
      'core.euiCollapsibleNavButton.ariaLabelExpand',
      { defaultMessage: 'Expand navigation' }
    ),
    'euiCollapsibleNavButton.ariaLabelCollapse': i18n.translate(
      'core.euiCollapsibleNavButton.ariaLabelCollapse',
      { defaultMessage: 'Collapse navigation' }
    ),
    'euiCollapsibleNavButton.ariaLabelClose': i18n.translate(
      'core.euiCollapsibleNavButton.ariaLabelClose',
      { defaultMessage: 'Close navigation' }
    ),
    'euiCollapsibleNavButton.ariaLabelOpen': i18n.translate(
      'core.euiCollapsibleNavButton.ariaLabelOpen',
      { defaultMessage: 'Open navigation' }
    ),
    'euiCollapsibleNavKibanaSolution.switcherTitle': i18n.translate(
      'core.euiCollapsibleNavKibanaSolution.switcherTitle',
      { defaultMessage: 'Solution view' }
    ),
    'euiCollapsibleNavKibanaSolution.switcherAriaLabel': i18n.translate(
      'core.euiCollapsibleNavKibanaSolution.switcherAriaLabel',
      { defaultMessage: '- click to switch to another solution' }
    ),
    'euiCollapsibleNavKibanaSolution.groupLabel': i18n.translate(
      'core.euiCollapsibleNavKibanaSolution.groupLabel',
      { defaultMessage: 'Navigate to solution' }
    ),
    'euiColorPicker.alphaLabel': i18n.translate('core.euiColorPicker.alphaLabel', {
      defaultMessage: 'Alpha channel (opacity) value',
      description: 'Label describing color alpha channel',
    }),
    'euiColorPicker.ariaLabel': i18n.translate('core.euiColorPicker.ariaLabel', {
      defaultMessage: 'Select a color',
      description: 'ARIA label for the color picker button',
    }),
    'euiColorPicker.colorLabel': i18n.translate('core.euiColorPicker.colorLabel', {
      defaultMessage: 'Color value',
    }),
    'euiColorPicker.colorErrorMessage': i18n.translate('core.euiColorPicker.colorErrorMessage', {
      defaultMessage: 'Invalid color value',
    }),
    'euiColorPicker.transparent': i18n.translate('core.euiColorPicker.transparent', {
      defaultMessage: 'Transparent',
    }),
    'euiColorPicker.openLabel': i18n.translate('core.euiColorPicker.openLabel', {
      defaultMessage: 'Press the escape key to close the popover',
      description: 'Screen reader text to describe how to close the picker',
    }),
    'euiColorPicker.closeLabel': i18n.translate('core.euiColorPicker.closeLabel', {
      defaultMessage: 'Press the down key to open a popover containing color options',
      description: 'Screen reader text to describe how to open the picker',
    }),
    'euiColorPicker.popoverLabel': i18n.translate('core.euiColorPicker.popoverLabel', {
      defaultMessage: 'Color selection dialog',
    }),
    'euiColorPickerSwatch.ariaLabel': ({ color }: EuiValues) =>
      i18n.translate('core.euiColorPickerSwatch.ariaLabel', {
        defaultMessage: 'Select {color} as the color',
        values: { color },
      }),
    'euiColumnActions.hideColumn': i18n.translate('core.euiColumnActions.hideColumn', {
      defaultMessage: 'Hide column',
    }),
    'euiColumnActions.sort': ({ schemaLabel }: EuiValues) =>
      i18n.translate('core.euiColumnActions.sort', {
        defaultMessage: 'Sort {schemaLabel}',
        values: { schemaLabel },
      }),
    'euiColumnActions.unsort': ({ schemaLabel }: EuiValues) =>
      i18n.translate('core.euiColumnActions.unsort', {
        defaultMessage: 'Unsort {schemaLabel}',
        values: { schemaLabel },
      }),
    'euiColumnActions.moveLeft': i18n.translate('core.euiColumnActions.moveLeft', {
      defaultMessage: 'Move left',
    }),
    'euiColumnActions.moveRight': i18n.translate('core.euiColumnActions.moveRight', {
      defaultMessage: 'Move right',
    }),
    'euiColumnSelector.dragHandleAriaLabel': i18n.translate(
      'core.euiColumnSelector.dragHandleAriaLabel',
      {
        defaultMessage: 'drag handle',
      }
    ),
    'euiColumnSelector.hideAll': i18n.translate('core.euiColumnSelector.hideAll', {
      defaultMessage: 'Hide all',
    }),
    'euiColumnSelector.selectAll': i18n.translate('core.euiColumnSelector.selectAll', {
      defaultMessage: 'Show all',
    }),
    'euiColumnSelector.button': i18n.translate('core.euiColumnSelector.button', {
      defaultMessage: 'Columns',
    }),
    'euiColumnSelector.search': i18n.translate('core.euiColumnSelector.search', {
      defaultMessage: 'Search',
    }),
    'euiColumnSelector.searchcolumns': i18n.translate('core.euiColumnSelector.searchcolumns', {
      defaultMessage: 'Search columns',
    }),
    'euiColumnSorting.clearAll': i18n.translate('core.euiColumnSorting.clearAll', {
      defaultMessage: 'Clear sorting',
    }),
    'euiColumnSorting.emptySorting': i18n.translate('core.euiColumnSorting.emptySorting', {
      defaultMessage: 'Currently no fields are sorted',
    }),
    'euiColumnSorting.pickFields': i18n.translate('core.euiColumnSorting.pickFields', {
      defaultMessage: 'Pick fields to sort by',
    }),
    'euiColumnSorting.sortFieldAriaLabel': i18n.translate(
      'core.euiColumnSorting.sortFieldAriaLabel',
      {
        defaultMessage: 'Sort by:',
      }
    ),
    'euiColumnSorting.button': i18n.translate('core.euiColumnSorting.button', {
      defaultMessage: 'Sort fields',
    }),
    'euiColumnSortingDraggable.activeSortLabel': ({ display }: EuiValues) =>
      i18n.translate('core.euiColumnSortingDraggable.activeSortLabel', {
        defaultMessage: '{display} is sorting this data grid',
        values: { display },
      }),
    'euiColumnSortingDraggable.defaultSortAsc': i18n.translate(
      'core.euiColumnSortingDraggable.defaultSortAsc',
      {
        defaultMessage: 'A-Z',
        description: 'Ascending sort label',
      }
    ),
    'euiColumnSortingDraggable.defaultSortDesc': i18n.translate(
      'core.euiColumnSortingDraggable.defaultSortDesc',
      {
        defaultMessage: 'Z-A',
        description: 'Descending sort label',
      }
    ),
    'euiColumnSortingDraggable.removeSortLabel': ({ display }: EuiValues) =>
      i18n.translate('core.euiColumnSortingDraggable.removeSortLabel', {
        defaultMessage: 'Remove {display} from data grid sort',
        values: { display },
      }),
    'euiColumnSortingDraggable.toggleLegend': ({ display }: EuiValues) =>
      i18n.translate('core.euiColumnSortingDraggable.toggleLegend', {
        defaultMessage: 'Select sorting method for {display}',
        values: { display },
      }),
    'euiColumnSortingDraggable.dragHandleAriaLabel': i18n.translate(
      'core.euiColumnSortingDraggable.dragHandleAriaLabel',
      {
        defaultMessage: 'Drag handle',
      }
    ),
    'euiComboBox.listboxAriaLabel': i18n.translate('core.euiComboBox.listboxAriaLabel', {
      defaultMessage: 'Choose from the following options',
    }),
    'euiComboBoxOptionsList.allOptionsSelected': i18n.translate(
      'core.euiComboBoxOptionsList.allOptionsSelected',
      {
        defaultMessage: "You've selected all available options",
      }
    ),
    'euiComboBoxOptionsList.alreadyAdded': ({ label }: EuiValues) =>
      i18n.translate('core.euiComboBoxOptionsList.alreadyAdded', {
        defaultMessage: '{label} has already been added',
        values: { label },
      }),
    'euiComboBoxOptionsList.createCustomOption': ({ searchValue }: EuiValues) =>
      i18n.translate('core.euiComboBoxOptionsList.createCustomOption', {
        defaultMessage: 'Add {searchValue} as a custom option',
        values: { searchValue },
      }),
    'euiComboBoxOptionsList.loadingOptions': i18n.translate(
      'core.euiComboBoxOptionsList.loadingOptions',
      {
        defaultMessage: 'Loading options',
        description: 'Placeholder message while data is asynchronously loaded',
      }
    ),
    'euiComboBoxOptionsList.noAvailableOptions': i18n.translate(
      'core.euiComboBoxOptionsList.noAvailableOptions',
      {
        defaultMessage: "There aren't any options available",
      }
    ),
    'euiComboBoxOptionsList.noMatchingOptions': ({ searchValue }: EuiValues) =>
      i18n.translate('core.euiComboBoxOptionsList.noMatchingOptions', {
        defaultMessage: "{searchValue} doesn't match any options",
        values: { searchValue },
      }),
    'euiComboBoxOptionsList.delimiterMessage': ({ delimiter }: EuiValues) =>
      i18n.translate('core.euiComboBoxOptionsList.delimiterMessage', {
        defaultMessage: 'Add each item separated by {delimiter}',
        values: { delimiter },
      }),
    'euiComboBoxPill.removeSelection': ({ children }: EuiValues) =>
      i18n.translate('core.euiComboBoxPill.removeSelection', {
        defaultMessage: 'Remove {children} from selection in this group',
        values: { children },
        description: 'ARIA label, `children` is the human-friendly value of an option',
      }),
    'euiCommonlyUsedTimeRanges.legend': i18n.translate('core.euiCommonlyUsedTimeRanges.legend', {
      defaultMessage: 'Commonly used',
    }),
    'euiGlobalToastList.clearAllToastsButtonAriaLabel': i18n.translate(
      'core.euiGlobalToastList.clearAllToastsButtonAriaLabel',
      {
        defaultMessage: 'Clear all toast notifications',
      }
    ),
    'euiGlobalToastList.clearAllToastsButtonDisplayText': i18n.translate(
      'core.euiGlobalToastList.clearAllToastsButtonDisplayText',
      {
        defaultMessage: 'Clear all',
      }
    ),
    'euiKeyboardShortcuts.title': i18n.translate('core.euiKeyboardShortcuts.title', {
      defaultMessage: 'Keyboard shortcuts',
    }),
    'euiKeyboardShortcuts.upArrowTitle': i18n.translate('core.euiKeyboardShortcuts.upArrowTitle', {
      defaultMessage: 'Up arrow',
    }),
    'euiKeyboardShortcuts.upArrowDescription': i18n.translate(
      'core.euiKeyboardShortcuts.upArrowDescription',
      {
        defaultMessage: 'Move one cell up',
      }
    ),
    'euiKeyboardShortcuts.downArrowTitle': i18n.translate(
      'core.euiKeyboardShortcuts.downArrowTitle',
      {
        defaultMessage: 'Down arrow',
      }
    ),
    'euiKeyboardShortcuts.downArrowDescription': i18n.translate(
      'core.euiKeyboardShortcuts.downArrowDescription',
      {
        defaultMessage: 'Move one cell down',
      }
    ),
    'euiKeyboardShortcuts.rightArrowTitle': i18n.translate(
      'core.euiKeyboardShortcuts.rightArrowTitle',
      {
        defaultMessage: 'Right arrow',
      }
    ),
    'euiKeyboardShortcuts.rightArrowDescription': i18n.translate(
      'core.euiKeyboardShortcuts.rightArrowDescription',
      {
        defaultMessage: 'Move one cell right',
      }
    ),
    'euiKeyboardShortcuts.leftArrowTitle': i18n.translate(
      'core.euiKeyboardShortcuts.leftArrowTitle',
      {
        defaultMessage: 'Left arrow',
      }
    ),
    'euiKeyboardShortcuts.leftArrowDescription': i18n.translate(
      'core.euiKeyboardShortcuts.leftArrowDescription',
      {
        defaultMessage: 'Move one cell left',
      }
    ),
    'euiKeyboardShortcuts.homeTitle': i18n.translate('core.euiKeyboardShortcuts.homeTitle', {
      defaultMessage: 'Home',
    }),
    'euiKeyboardShortcuts.homeDescription': i18n.translate(
      'core.euiKeyboardShortcuts.homeDescription',
      {
        defaultMessage: 'Move to the first cell of the current row',
      }
    ),
    'euiKeyboardShortcuts.endTitle': i18n.translate('core.euiKeyboardShortcuts.endTitle', {
      defaultMessage: 'End',
    }),
    'euiKeyboardShortcuts.endDescription': i18n.translate(
      'core.euiKeyboardShortcuts.endDescription',
      {
        defaultMessage: 'Move to the last cell of the current row',
      }
    ),
    'euiKeyboardShortcuts.ctrl': i18n.translate('core.euiKeyboardShortcuts.ctrl', {
      defaultMessage: 'Ctrl',
    }),
    'euiKeyboardShortcuts.ctrlHomeDescription': i18n.translate(
      'core.euiKeyboardShortcuts.ctrlHomeDescription',
      {
        defaultMessage: 'Move to the first cell of the current page',
      }
    ),
    'euiKeyboardShortcuts.ctrlEndDescription': i18n.translate(
      'core.euiKeyboardShortcuts.ctrlEndDescription',
      {
        defaultMessage: 'Move to the last cell of the current page',
      }
    ),
    'euiKeyboardShortcuts.pageUpTitle': i18n.translate('core.euiKeyboardShortcuts.pageUpTitle', {
      defaultMessage: 'Page Up',
    }),
    'euiKeyboardShortcuts.pageUpDescription': i18n.translate(
      'core.euiKeyboardShortcuts.pageUpDescription',
      {
        defaultMessage: 'Go to the last row of the previous page',
      }
    ),
    'euiKeyboardShortcuts.pageDownTitle': i18n.translate(
      'core.euiKeyboardShortcuts.pageDownTitle',
      {
        defaultMessage: 'Page Down',
      }
    ),
    'euiKeyboardShortcuts.pageDownDescription': i18n.translate(
      'core.euiKeyboardShortcuts.pageDownDescription',
      {
        defaultMessage: 'Go to the first row of the next page',
      }
    ),
    'euiKeyboardShortcuts.enterTitle': i18n.translate('core.euiKeyboardShortcuts.enterTitle', {
      defaultMessage: 'Enter',
    }),
    'euiKeyboardShortcuts.enterDescription': i18n.translate(
      'core.euiKeyboardShortcuts.enterDescription',
      {
        defaultMessage: 'Open cell details and actions',
      }
    ),
    'euiKeyboardShortcuts.escapeTitle': i18n.translate('core.euiKeyboardShortcuts.escapeTitle', {
      defaultMessage: 'Escape',
    }),
    'euiKeyboardShortcuts.escapeDescription': i18n.translate(
      'core.euiKeyboardShortcuts.escapeDescription',
      {
        defaultMessage: 'Close cell details and actions',
      }
    ),
    'euiDataGrid.screenReaderNotice': i18n.translate('core.euiDataGrid.screenReaderNotice', {
      defaultMessage: 'Cell contains interactive content.',
    }),
    'euiDataGrid.ariaLabel': ({ label, page, pageCount }: EuiValues) =>
      i18n.translate('core.euiDataGrid.ariaLabel', {
        defaultMessage: '{label}; Page {page} of {pageCount}.',
        values: { label, page, pageCount },
        description: 'Screen reader text to describe the size of the data grid',
      }),
    'euiDataGrid.ariaLabelledBy': ({ page, pageCount }: EuiValues) =>
      i18n.translate('core.euiDataGrid.ariaLabelledBy', {
        defaultMessage: 'Page {page} of {pageCount}.',
        values: { page, pageCount },
        description: 'Screen reader text to describe the size of the data grid',
      }),
    'euiDataGridCell.position': ({ columnName, columnIndex, rowIndex }: EuiValues) =>
      i18n.translate('core.euiDataGridCell.position', {
        defaultMessage: '{columnName}, column {columnIndex}, row {rowIndex}',
        values: { columnName, columnIndex, rowIndex },
      }),
    'euiDataGridCell.expansionEnterPrompt': i18n.translate(
      'core.euiDataGridCell.expansionEnterPrompt',
      { defaultMessage: 'Press the Enter key to expand this cell.' }
    ),
    'euiDataGridCell.focusTrapEnterPrompt': i18n.translate(
      'core.euiDataGridCell.focusTrapEnterPrompt',
      { defaultMessage: "Press the Enter key to interact with this cell's contents." }
    ),
    'euiDataGridCell.focusTrapExitPrompt': i18n.translate(
      'core.euiDataGridCell.focusTrapExitPrompt',
      { defaultMessage: 'Exited cell content.' }
    ),
    'euiDataGridCell.focusTrapEnteredExitPrompt': i18n.translate(
      'core.euiDataGridCell.focusTrapEnteredExitPrompt',
      {
        defaultMessage: 'Press the Escape key to exit the cell.',
      }
    ),
    'euiDataGridCellActions.expandButtonTitle': i18n.translate(
      'core.euiDataGridCellActions.expandButtonTitle',
      {
        defaultMessage: 'Click or hit enter to interact with cell content',
      }
    ),
    'euiDataGridHeaderCell.actionsButtonAriaLabel': ({ title }: EuiValues) =>
      i18n.translate('core.euiDataGridHeaderCell.actionsButtonAriaLabel', {
        defaultMessage: '{title}. Click to view column header actions.',
        values: { title },
      }),
    'euiDataGridHeaderCell.actionsEnterKeyInstructions': i18n.translate(
      'core.euiDataGridHeaderCell.actionsEnterKeyInstructions',
      {
        defaultMessage: "Press the Enter key to view this column's actions",
      }
    ),
    'euiDataGridHeaderCell.sortedByAscendingSingle': i18n.translate(
      'core.euiDataGridHeaderCell.sortedByAscendingSingle',
      {
        defaultMessage: 'Sorted ascending',
      }
    ),
    'euiDataGridHeaderCell.sortedByDescendingSingle': i18n.translate(
      'core.euiDataGridHeaderCell.sortedByDescendingSingle',
      {
        defaultMessage: 'Sorted descending',
      }
    ),
    'euiDataGridHeaderCell.sortedByAscendingFirst': ({ columnId }: EuiValues) =>
      i18n.translate('core.euiDataGridHeaderCell.sortedByAscendingFirst', {
        defaultMessage: 'Sorted by {columnId}, ascending',
        values: { columnId },
      }),
    'euiDataGridHeaderCell.sortedByDescendingFirst': ({ columnId }: EuiValues) =>
      i18n.translate('core.euiDataGridHeaderCell.sortedByDescendingFirst', {
        defaultMessage: 'Sorted by {columnId}, descending',
        values: { columnId },
      }),
    'euiDataGridHeaderCell.sortedByAscendingMultiple': ({ columnId }: EuiValues) =>
      i18n.translate('core.euiDataGridHeaderCell.sortedByAscendingMultiple', {
        defaultMessage: ', then sorted by {columnId}, ascending',
        values: { columnId },
      }),
    'euiDataGridHeaderCell.sortedByDescendingMultiple': ({ columnId }: EuiValues) =>
      i18n.translate('core.euiDataGridHeaderCell.sortedByDescendingMultiple', {
        defaultMessage: ', then sorted by {columnId}, descending',
        values: { columnId },
      }),
    'euiDataGridHeaderCell.actionsPopoverScreenReaderText': i18n.translate(
      'core.euiDataGridHeaderCell.actionsPopoverScreenReaderText',
      {
        defaultMessage:
          'To navigate through the list of column actions, press the Tab or Up and Down arrow keys.',
      }
    ),
    'euiDataGridPagination.detailedPaginationLabel': ({ label }: EuiValues) =>
      i18n.translate('core.euiDataGridPagination.detailedPaginationLabel', {
        defaultMessage: 'Pagination for preceding grid: {label}',
        values: { label },
      }),
    'euiDataGridPagination.paginationLabel': i18n.translate(
      'core.euiDataGridPagination.paginationLabel',
      {
        defaultMessage: 'Pagination for preceding grid',
      }
    ),
    'euiDataGridSchema.booleanSortTextAsc': i18n.translate(
      'core.euiDataGridSchema.booleanSortTextAsc',
      {
        defaultMessage: 'False-True',
        description: 'Ascending boolean label',
      }
    ),
    'euiDataGridSchema.booleanSortTextDesc': i18n.translate(
      'core.euiDataGridSchema.booleanSortTextDesc',
      {
        defaultMessage: 'True-False',
        description: 'Descending boolean label',
      }
    ),
    'euiDataGridSchema.currencySortTextAsc': i18n.translate(
      'core.euiDataGridSchema.currencySortTextAsc',
      {
        defaultMessage: 'Low-High',
        description: 'Ascending currency label',
      }
    ),
    'euiDataGridSchema.currencySortTextDesc': i18n.translate(
      'core.euiDataGridSchema.currencySortTextDesc',
      {
        defaultMessage: 'High-Low',
        description: 'Descending currency label',
      }
    ),
    'euiDataGridSchema.dateSortTextAsc': i18n.translate('core.euiDataGridSchema.dateSortTextAsc', {
      defaultMessage: 'Old-New',
      description: 'Ascending date label',
    }),
    'euiDataGridSchema.dateSortTextDesc': i18n.translate(
      'core.euiDataGridSchema.dateSortTextDesc',
      {
        defaultMessage: 'New-Old',
        description: 'Descending date label',
      }
    ),
    'euiDataGridSchema.numberSortTextAsc': i18n.translate(
      'core.euiDataGridSchema.numberSortTextAsc',
      {
        defaultMessage: 'Low-High',
        description: 'Ascending number label',
      }
    ),
    'euiDataGridSchema.numberSortTextDesc': i18n.translate(
      'core.euiDataGridSchema.numberSortTextDesc',
      {
        defaultMessage: 'High-Low',
        description: 'Descending number label',
      }
    ),
    'euiDataGridSchema.jsonSortTextAsc': i18n.translate('core.euiDataGridSchema.jsonSortTextAsc', {
      defaultMessage: 'Small-Large',
      description: 'Ascending size label',
    }),
    'euiDataGridSchema.jsonSortTextDesc': i18n.translate(
      'core.euiDataGridSchema.jsonSortTextDesc',
      {
        defaultMessage: 'Large-Small',
        description: 'Descending size label',
      }
    ),
    'euiDataGridToolbarControl.badgeAriaLabel': ({ count }: EuiValues) =>
      i18n.translate('core.euiDataGridToolbarControl.badgeAriaLabel', {
        defaultMessage: 'Active: {count}',
        values: { count },
      }),
    'euiDatePopoverButton.invalidTitle': ({ title }: EuiValues) =>
      i18n.translate('core.euiDatePopoverButton.invalidTitle', {
        defaultMessage: 'Invalid date: {title}',
        values: { title },
      }),
    'euiDatePopoverButton.outdatedTitle': ({ title }: EuiValues) =>
      i18n.translate('core.euiDatePopoverButton.outdatedTitle', {
        defaultMessage: 'Update needed: {title}',
        values: { title },
      }),
    'euiDisplaySelector.buttonText': i18n.translate('core.euiDisplaySelector.buttonText', {
      defaultMessage: 'Display options',
    }),
    'euiDisplaySelector.resetButtonText': i18n.translate(
      'core.euiDisplaySelector.resetButtonText',
      {
        defaultMessage: 'Reset to default',
      }
    ),
    'euiDisplaySelector.densityLabel': i18n.translate('core.euiDisplaySelector.densityLabel', {
      defaultMessage: 'Density',
    }),
    'euiDisplaySelector.labelCompact': i18n.translate('core.euiDisplaySelector.labelCompact', {
      defaultMessage: 'Compact',
    }),
    'euiDisplaySelector.labelNormal': i18n.translate('core.euiDisplaySelector.labelNormal', {
      defaultMessage: 'Normal',
    }),
    'euiDisplaySelector.labelExpanded': i18n.translate('core.euiDisplaySelector.labelExpanded', {
      defaultMessage: 'Expanded',
    }),
    'euiDisplaySelector.labelAuto': i18n.translate('core.euiDisplaySelector.labelAuto', {
      defaultMessage: 'Auto',
    }),
    'euiDisplaySelector.labelStatic': i18n.translate('core.euiDisplaySelector.labelStatic', {
      defaultMessage: 'Static',
    }),
    'euiDisplaySelector.labelMax': i18n.translate('core.euiDisplaySelector.labelMax', {
      defaultMessage: 'Max',
    }),
    'euiDisplaySelector.rowHeightLabel': i18n.translate('core.euiDisplaySelector.rowHeightLabel', {
      defaultMessage: 'Lines per row',
    }),
    'euiFieldPassword.showPassword': i18n.translate('core.euiFieldPassword.showPassword', {
      defaultMessage:
        'Show password as plain text. Note: this will visually expose your password on the screen.',
    }),
    'euiFieldPassword.maskPassword': i18n.translate('core.euiFieldPassword.maskPassword', {
      defaultMessage: 'Mask password',
    }),
    'euiFieldSearch.clearSearchButtonLabel': i18n.translate(
      'core.euiFieldSearch.clearSearchButtonLabel',
      { defaultMessage: 'Clear search input' }
    ),
    'euiFilePicker.removeSelectedAriaLabel': i18n.translate(
      'core.euiFilePicker.removeSelectedAriaLabel',
      {
        defaultMessage: 'Remove selected files',
      }
    ),
    'euiFilePicker.filesSelected': ({ fileCount }: EuiValues) =>
      i18n.translate('core.euiFilePicker.filesSelected', {
        defaultMessage: '{fileCount} files selected',
        values: { fileCount },
      }),
    'euiFilePicker.promptText': i18n.translate('core.euiFilePicker.promptText', {
      defaultMessage: 'Select or drag and drop a file',
    }),
    'euiFilePicker.removeSelected': i18n.translate('core.euiFilePicker.removeSelected', {
      defaultMessage: 'Remove',
    }),
    'euiFilterButton.filterBadgeActiveAriaLabel': ({ count }: EuiValues) =>
      i18n.translate('core.euiFilterButton.filterBadgeActiveAriaLabel', {
        defaultMessage: '{count} active filters',
        values: { count },
      }),
    'euiFilterButton.filterBadgeAvailableAriaLabel': ({ count }: EuiValues) =>
      i18n.translate('core.euiFilterButton.filterBadgeAvailableAriaLabel', {
        defaultMessage: '{count} available filters',
        values: { count },
      }),
    'euiFlyoutCloseButton.ariaLabel': i18n.translate('core.euiFlyoutCloseButton.ariaLabel', {
      defaultMessage: 'Close this dialog',
    }),
    'euiFlyout.screenReaderModalDialog': i18n.translate('core.euiFlyout.screenReaderModalDialog', {
      defaultMessage:
        'You are in a modal dialog. Press Escape or tap/click outside the dialog on the shadowed overlay to close.',
    }),
    'euiFlyout.screenReaderNoOverlayMaskDialog': i18n.translate(
      'core.euiFlyout.screenReaderNoOverlayMaskDialog',
      {
        defaultMessage: 'You are in a modal dialog. To close the dialog, press Escape.',
      }
    ),
    'euiFlyout.screenReaderFocusTrapShards': i18n.translate(
      'core.euiFlyout.screenReaderFocusTrapShards',
      {
        defaultMessage: 'You can still continue tabbing through other global page landmarks.',
      }
    ),
    'euiFlyoutMenu.back': i18n.translate('core.euiFlyoutMenu.back', {
      defaultMessage: 'Back',
    }),
    'euiFlyoutMenu.history': i18n.translate('core.euiFlyoutMenu.history', {
      defaultMessage: 'History',
    }),
    'euiFlyoutManaged.defaultTitle': i18n.translate('core.euiFlyoutManaged.defaultTitle', {
      defaultMessage: 'Unknown Flyout',
    }),
    'euiForm.addressFormErrors': i18n.translate('core.euiForm.addressFormErrors', {
      defaultMessage: 'Please address the highlighted errors.',
    }),
    'euiFormControlLayoutClearButton.label': i18n.translate(
      'core.euiFormControlLayoutClearButton.label',
      {
        defaultMessage: 'Clear input',
        description: 'ARIA label on a button that removes any entry in a form field',
      }
    ),
    'euiFormControlLayoutDelimited.delimiterLabel': i18n.translate(
      'core.euiFormControlLayoutDelimited.delimiterLabel',
      {
        defaultMessage: 'to',
      }
    ),
    'euiFullscreenSelector.fullscreenButton': i18n.translate(
      'core.euiFullscreenSelector.fullscreenButton',
      {
        defaultMessage: 'Enter fullscreen',
      }
    ),
    'euiFullscreenSelector.fullscreenButtonActive': i18n.translate(
      'core.euiFullscreenSelector.fullscreenButtonActive',
      {
        defaultMessage: 'Exit fullscreen',
      }
    ),
    'euiHeaderLinks.appNavigation': i18n.translate('core.euiHeaderLinks.appNavigation', {
      defaultMessage: 'App menu',
      description: 'ARIA label on a `nav` element',
    }),
    'euiHeaderLinks.openNavigationMenu': i18n.translate('core.euiHeaderLinks.openNavigationMenu', {
      defaultMessage: 'Open menu',
    }),
    'euiHue.label': i18n.translate('core.euiHue.label', {
      defaultMessage: 'Select the HSV color mode "hue" value',
    }),
    'euiIconTip.defaultAriaLabel': i18n.translate('core.euiIconTip.defaultAriaLabel', {
      defaultMessage: 'Info',
    }),
    'euiImageButton.openFullScreen': i18n.translate('core.euiImageButton.openFullScreen', {
      defaultMessage: 'Click to open this image in fullscreen mode',
    }),
    'euiImageButton.closeFullScreen': i18n.translate('core.euiImageButton.closeFullScreen', {
      defaultMessage: 'Press Escape or click to close image fullscreen mode',
    }),
    'euiInlineEditForm.activateEditModeDescription': i18n.translate(
      'core.euiInlineEditForm.activateEditModeDescription',
      { defaultMessage: 'Click to edit this text inline.' }
    ),
    'euiInlineEditForm.inputKeyboardInstructions': i18n.translate(
      'core.euiInlineEditForm.inputKeyboardInstructions',
      { defaultMessage: 'Press Enter to save your edited text. Press Escape to cancel your edit.' }
    ),
    'euiInlineEditForm.cancelButtonAriaLabel': i18n.translate(
      'core.euiInlineEditForm.cancelButtonAriaLabel',
      { defaultMessage: 'Cancel edit' }
    ),
    'euiInlineEditForm.saveButtonAriaLabel': i18n.translate(
      'core.euiInlineEditForm.saveButtonAriaLabel',
      { defaultMessage: 'Save edit' }
    ),
    'euiExternalLinkIcon.externalTarget.screenReaderOnlyText': i18n.translate(
      'core.euiExternalLinkIcon.externalTarget.screenReaderOnlyText',
      {
        defaultMessage: '(external)',
      }
    ),
    'euiExternalLinkIcon.newTarget.screenReaderOnlyText': i18n.translate(
      'core.euiExternalLinkIcon.newTarget.screenReaderOnlyText',
      {
        defaultMessage: '(external, opens in a new tab or window)',
      }
    ),
    'euiLoadingStrings.ariaLabel': i18n.translate('core.euiLoadingStrings.ariaLabel', {
      defaultMessage: 'Loading',
    }),
    'euiMark.highlightStart': i18n.translate('core.euiMark.highlightStart', {
      defaultMessage: 'highlight start',
    }),
    'euiMark.highlightEnd': i18n.translate('core.euiMark.highlightEnd', {
      defaultMessage: 'highlight end',
    }),
    'euiMarkdownEditorFooter.uploadingFiles': i18n.translate(
      'core.euiMarkdownEditorFooter.uploadingFiles',
      {
        defaultMessage: 'Click to upload files',
      }
    ),
    'euiMarkdownEditorFooter.openUploadModal': i18n.translate(
      'core.euiMarkdownEditorFooter.openUploadModal',
      {
        defaultMessage: 'Open upload files modal',
      }
    ),
    'euiMarkdownEditorFooter.unsupportedFileType': i18n.translate(
      'core.euiMarkdownEditorFooter.unsupportedFileType',
      {
        defaultMessage: 'File type not supported',
      }
    ),
    'euiMarkdownEditorFooter.supportedFileTypes': ({ supportedFileTypes }: EuiValues) =>
      i18n.translate('core.euiMarkdownEditorFooter.supportedFileTypes', {
        defaultMessage: 'Supported files: {supportedFileTypes}',
        values: { supportedFileTypes },
      }),
    'euiMarkdownEditorFooter.showSyntaxErrors': i18n.translate(
      'core.euiMarkdownEditorFooter.showSyntaxErrors',
      {
        defaultMessage: 'Show errors',
      }
    ),
    'euiMarkdownEditorFooter.errorsTitle': i18n.translate(
      'core.euiMarkdownEditorFooter.errorsTitle',
      {
        defaultMessage: 'Errors',
      }
    ),
    'euiMarkdownEditorHelpButton.mdSyntaxLink': i18n.translate(
      'core.euiMarkdownEditorHelpButton.mdSyntaxLink',
      {
        defaultMessage: 'GitHub flavored markdown',
      }
    ),
    'euiMarkdownEditorHelpButton.syntaxTitle': i18n.translate(
      'core.euiMarkdownEditorHelpButton.syntaxTitle',
      {
        defaultMessage: 'Syntax help',
      }
    ),
    'euiMarkdownEditorHelpButton.showMarkdownHelp': i18n.translate(
      'core.euiMarkdownEditorHelpButton.showMarkdownHelp',
      {
        defaultMessage: 'Show markdown help',
      }
    ),
    'euiMarkdownEditorHelpButton.syntaxModalDescriptionPrefix': i18n.translate(
      'core.euiMarkdownEditorHelpButton.syntaxModalDescriptionPrefix',
      {
        defaultMessage: 'This editor uses',
      }
    ),
    'euiMarkdownEditorHelpButton.syntaxModalDescriptionSuffix': i18n.translate(
      'core.euiMarkdownEditorHelpButton.syntaxModalDescriptionSuffix',
      {
        defaultMessage:
          'You can also utilize these additional syntax plugins to add rich content to your text.',
      }
    ),
    'euiMarkdownEditorHelpButton.closeButton': i18n.translate(
      'core.euiMarkdownEditorHelpButton.closeButton',
      {
        defaultMessage: 'Close',
      }
    ),
    'euiMarkdownEditorHelpButton.syntaxPopoverDescription': i18n.translate(
      'core.euiMarkdownEditorHelpButton.syntaxPopoverDescription',
      {
        defaultMessage: 'This editor uses',
      }
    ),
    'euiMarkdownEditorToolbar.editor': i18n.translate('core.euiMarkdownEditorToolbar.editor', {
      defaultMessage: 'Editor',
    }),
    'euiMarkdownEditorToolbar.previewMarkdown': i18n.translate(
      'core.euiMarkdownEditorToolbar.previewMarkdown',
      {
        defaultMessage: 'Preview',
      }
    ),
    'euiModal.closeModal': i18n.translate('core.euiModal.closeModal', {
      defaultMessage: 'Closes this modal window',
    }),
    'euiModal.screenReaderModalDialog': i18n.translate('core.euiModal.screenReaderModalDialog', {
      defaultMessage:
        'You are in a modal dialog. Press Escape or tap/click outside the dialog on the shadowed overlay to close.',
    }),
    'euiErrorBoundary.error': i18n.translate('core.euiErrorBoundary.error', {
      defaultMessage: 'Error',
      description: 'Error boundary for uncaught exceptions when rendering part of the application',
    }),
    'euiPagination.pageOfTotalCompressed': ({ page, total }: EuiValues) =>
      i18n.translate('core.euiPagination.pageOfTotalCompressed', {
        defaultMessage: '{page} of {total}',
        values: { page, total },
      }),
    'euiPagination.firstRangeAriaLabel': ({ lastPage }: EuiValues) =>
      i18n.translate('core.euiPagination.firstRangeAriaLabel', {
        defaultMessage: 'Skipping pages 2 to {lastPage}',
        values: { lastPage },
      }),
    'euiPagination.lastRangeAriaLabel': ({ firstPage, lastPage }: EuiValues) =>
      i18n.translate('core.euiPagination.lastRangeAriaLabel', {
        defaultMessage: 'Skipping pages {firstPage} to {lastPage}',
        values: { firstPage, lastPage },
      }),
    'euiPagination.last': i18n.translate('core.euiPagination.last', {
      defaultMessage: 'Last',
    }),
    'euiPagination.page': i18n.translate('core.euiPagination.page', {
      defaultMessage: 'Page',
    }),
    'euiPagination.of': i18n.translate('core.euiPagination.of', {
      defaultMessage: 'of',
    }),
    'euiPagination.collection': i18n.translate('core.euiPagination.collection', {
      defaultMessage: 'collection',
    }),
    'euiPagination.fromEndLabel': i18n.translate('core.euiPagination.fromEndLabel', {
      defaultMessage: 'from end',
    }),
    'euiPaginationButton.longPageString': ({ page, totalPages }: EuiValues) =>
      i18n.translate('core.euiPaginationButton.longPageString', {
        defaultMessage: 'Page {page} of {totalPages}',
        values: { page, totalPages },
        description: 'Text to describe the size of a paginated section',
      }),
    'euiPaginationButton.shortPageString': ({ page }: EuiValues) =>
      i18n.translate('core.euiPaginationButton.shortPageString', {
        defaultMessage: 'Page {page}',
        values: { page },
        description: 'Text to describe the current page of a paginated section',
      }),
    'euiPaginationButtonArrow.nextPage': i18n.translate('core.euiPaginationButtonArrow.nextPage', {
      defaultMessage: 'Next page',
    }),
    'euiPaginationButtonArrow.previousPage': i18n.translate(
      'core.euiPaginationButtonArrow.previousPage',
      {
        defaultMessage: 'Previous page',
      }
    ),
    'euiPaginationButtonArrow.firstPage': i18n.translate(
      'core.euiPaginationButtonArrow.firstPage',
      {
        defaultMessage: 'First page',
      }
    ),
    'euiPaginationButtonArrow.lastPage': i18n.translate('core.euiPaginationButtonArrow.lastPage', {
      defaultMessage: 'Last page',
    }),
    'euiPinnableListGroup.pinExtraActionLabel': i18n.translate(
      'core.euiPinnableListGroup.pinExtraActionLabel',
      {
        defaultMessage: 'Pin item',
      }
    ),
    'euiPinnableListGroup.pinnedExtraActionLabel': i18n.translate(
      'core.euiPinnableListGroup.pinnedExtraActionLabel',
      {
        defaultMessage: 'Unpin item',
      }
    ),
    'euiPopover.screenReaderAnnouncement': i18n.translate(
      'core.euiPopover.screenReaderAnnouncement',
      {
        defaultMessage:
          'You are in a dialog. Press Escape, or tap/click outside the dialog to close.',
      }
    ),
    'euiProgress.valueText': ({ value }: EuiValues) =>
      i18n.translate('core.euiProgress.valueText', {
        defaultMessage: '{value}%',
        values: { value },
      }),
    'euiPrettyDuration.lastDurationSeconds': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationSeconds', {
        defaultMessage: 'Last {duration, plural, one {# second} other {# seconds}}',
        values: { duration },
      }),
    'euiPrettyDuration.nextDurationSeconds': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nextDurationSeconds', {
        defaultMessage: 'Next {duration, plural, one {# second} other {# seconds}}',
        values: { duration },
      }),
    'euiPrettyDuration.lastDurationMinutes': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationMinutes', {
        defaultMessage: 'Last {duration, plural, one {# minute} other {# minutes}}',
        values: { duration },
      }),
    'euiPrettyDuration.nextDurationMinutes': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nextDurationMinutes', {
        defaultMessage: 'Next {duration, plural, one {# minute} other {# minutes}}',
        values: { duration },
      }),
    'euiPrettyDuration.lastDurationHours': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationHours', {
        defaultMessage: 'Last {duration, plural, one {# hour} other {# hours}}',
        values: { duration },
      }),
    'euiPrettyDuration.nextDurationHours': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nextDurationHours', {
        defaultMessage: 'Next {duration, plural, one {# hour} other {# hours}}',
        values: { duration },
      }),
    'euiPrettyDuration.lastDurationDays': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationDays', {
        defaultMessage: 'Last {duration, plural, one {# day} other {# days}}',
        values: { duration },
      }),
    'euiPrettyDuration.nexttDurationDays': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nexttDurationDays', {
        defaultMessage: 'Next {duration, plural, one {# day} other {# days}}',
        values: { duration },
      }),
    'euiPrettyDuration.lastDurationWeeks': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationWeeks', {
        defaultMessage: 'Last {duration, plural, one {# week} other {# weeks}}',
        values: { duration },
      }),
    'euiPrettyDuration.nextDurationWeeks': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nextDurationWeeks', {
        defaultMessage: 'Next {duration, plural, one {# week} other {# weeks}}',
        values: { duration },
      }),
    'euiPrettyDuration.lastDurationMonths': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationMonths', {
        defaultMessage: 'Last {duration, plural, one {# month} other {# months}}',
        values: { duration },
      }),
    'euiPrettyDuration.nextDurationMonths': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nextDurationMonths', {
        defaultMessage: 'Next {duration, plural, one {# month} other {# months}}',
        values: { duration },
      }),
    'euiPrettyDuration.lastDurationYears': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.lastDurationYears', {
        defaultMessage: 'Last {duration, plural, one {# year} other {# years}}',
        values: { duration },
      }),
    'euiPrettyDuration.nextDurationYears': ({ duration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.nextDurationYears', {
        defaultMessage: 'Next {duration, plural, one {# year} other {# years}}',
        values: { duration },
      }),
    'euiPrettyDuration.durationRoundedToSecond': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToSecond', {
        defaultMessage: '{prettyDuration} rounded to the second',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.durationRoundedToMinute': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToMinute', {
        defaultMessage: '{prettyDuration} rounded to the minute',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.durationRoundedToHour': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToHour', {
        defaultMessage: '{prettyDuration} rounded to the hour',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.durationRoundedToDay': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToDay', {
        defaultMessage: '{prettyDuration} rounded to the day',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.durationRoundedToWeek': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToWeek', {
        defaultMessage: '{prettyDuration} rounded to the week',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.durationRoundedToMonth': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToMonth', {
        defaultMessage: '{prettyDuration} rounded to the month',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.durationRoundedToYear': ({ prettyDuration }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.durationRoundedToYear', {
        defaultMessage: '{prettyDuration} rounded to the year',
        values: { prettyDuration },
      }),
    'euiPrettyDuration.now': i18n.translate('core.euiPrettyDuration.now', {
      defaultMessage: 'now',
    }),
    'euiPrettyDuration.invalid': i18n.translate('core.euiPrettyDuration.invalid', {
      defaultMessage: 'Invalid date',
    }),
    'euiPrettyDuration.fallbackDuration': ({ displayFrom, displayTo }: EuiValues) =>
      i18n.translate('core.euiPrettyDuration.fallbackDuration', {
        defaultMessage: '{displayFrom} to {displayTo}',
        values: { displayFrom, displayTo },
      }),
    'euiPrettyInterval.seconds': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.seconds', {
        defaultMessage: '{interval, plural, one {# second} other {# seconds}}',
        values: { interval },
      }),
    'euiPrettyInterval.minutes': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.minutes', {
        defaultMessage: '{interval, plural, one {# minute} other {# minutes}}',
        values: { interval },
      }),
    'euiPrettyInterval.hours': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.hours', {
        defaultMessage: '{interval, plural, one {# hour} other {# hours}}',
        values: { interval },
      }),
    'euiPrettyInterval.days': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.days', {
        defaultMessage: '{interval, plural, one {# day} other {# days}}',
        values: { interval },
      }),
    'euiPrettyInterval.secondsShorthand': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.secondsShorthand', {
        defaultMessage: '{interval} s',
        values: { interval },
      }),
    'euiPrettyInterval.minutesShorthand': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.minutesShorthand', {
        defaultMessage: '{interval} m',
        values: { interval },
      }),
    'euiPrettyInterval.hoursShorthand': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.hoursShorthand', {
        defaultMessage: '{interval} h',
        values: { interval },
      }),
    'euiPrettyInterval.daysShorthand': ({ interval }: EuiValues) =>
      i18n.translate('core.euiPrettyInterval.daysShorthand', {
        defaultMessage: '{interval} d',
        values: { interval },
      }),
    'euiPrettyInterval.off': i18n.translate('core.euiPrettyInterval.off', {
      defaultMessage: 'Off',
    }),
    'euiTimeOptions.last': i18n.translate('core.euiTimeOptions.last', {
      defaultMessage: 'Last',
    }),
    'euiTimeOptions.next': i18n.translate('core.euiTimeOptions.next', {
      defaultMessage: 'Next',
    }),
    'euiTimeOptions.seconds': i18n.translate('core.euiTimeOptions.seconds', {
      defaultMessage: 'Seconds',
    }),
    'euiTimeOptions.minutes': i18n.translate('core.euiTimeOptions.minutes', {
      defaultMessage: 'Minutes',
    }),
    'euiTimeOptions.hours': i18n.translate('core.euiTimeOptions.hours', {
      defaultMessage: 'Hours',
    }),
    'euiTimeOptions.days': i18n.translate('core.euiTimeOptions.days', {
      defaultMessage: 'Days',
    }),
    'euiTimeOptions.weeks': i18n.translate('core.euiTimeOptions.weeks', {
      defaultMessage: 'Weeks',
    }),
    'euiTimeOptions.months': i18n.translate('core.euiTimeOptions.months', {
      defaultMessage: 'Months',
    }),
    'euiTimeOptions.years': i18n.translate('core.euiTimeOptions.years', {
      defaultMessage: 'Years',
    }),
    'euiTimeOptions.secondsAgo': i18n.translate('core.euiTimeOptions.secondsAgo', {
      defaultMessage: 'Seconds ago',
    }),
    'euiTimeOptions.minutesAgo': i18n.translate('core.euiTimeOptions.minutesAgo', {
      defaultMessage: 'Minutes ago',
    }),
    'euiTimeOptions.hoursAgo': i18n.translate('core.euiTimeOptions.hoursAgo', {
      defaultMessage: 'Hours ago',
    }),
    'euiTimeOptions.daysAgo': i18n.translate('core.euiTimeOptions.daysAgo', {
      defaultMessage: 'Days ago',
    }),
    'euiTimeOptions.weeksAgo': i18n.translate('core.euiTimeOptions.weeksAgo', {
      defaultMessage: 'Weeks ago',
    }),
    'euiTimeOptions.monthsAgo': i18n.translate('core.euiTimeOptions.monthsAgo', {
      defaultMessage: 'Months ago',
    }),
    'euiTimeOptions.yearsAgo': i18n.translate('core.euiTimeOptions.yearsAgo', {
      defaultMessage: 'Years ago',
    }),
    'euiTimeOptions.secondsFromNow': i18n.translate('core.euiTimeOptions.secondsFromNow', {
      defaultMessage: 'Seconds from now',
    }),
    'euiTimeOptions.minutesFromNow': i18n.translate('core.euiTimeOptions.minutesFromNow', {
      defaultMessage: 'Minutes from now',
    }),
    'euiTimeOptions.hoursFromNow': i18n.translate('core.euiTimeOptions.hoursFromNow', {
      defaultMessage: 'Hours from now',
    }),
    'euiTimeOptions.daysFromNow': i18n.translate('core.euiTimeOptions.daysFromNow', {
      defaultMessage: 'Days from now',
    }),
    'euiTimeOptions.weeksFromNow': i18n.translate('core.euiTimeOptions.weeksFromNow', {
      defaultMessage: 'Weeks from now',
    }),
    'euiTimeOptions.monthsFromNow': i18n.translate('core.euiTimeOptions.monthsFromNow', {
      defaultMessage: 'Months from now',
    }),
    'euiTimeOptions.yearsFromNow': i18n.translate('core.euiTimeOptions.yearsFromNow', {
      defaultMessage: 'Years from now',
    }),
    'euiTimeOptions.roundToSecond': i18n.translate('core.euiTimeOptions.roundToSecond', {
      defaultMessage: 'Round to the second',
    }),
    'euiTimeOptions.roundToMinute': i18n.translate('core.euiTimeOptions.roundToMinute', {
      defaultMessage: 'Round to the minute',
    }),
    'euiTimeOptions.roundToHour': i18n.translate('core.euiTimeOptions.roundToHour', {
      defaultMessage: 'Round to the hour',
    }),
    'euiTimeOptions.roundToDay': i18n.translate('core.euiTimeOptions.roundToDay', {
      defaultMessage: 'Round to the day',
    }),
    'euiTimeOptions.roundToWeek': i18n.translate('core.euiTimeOptions.roundToWeek', {
      defaultMessage: 'Round to the week',
    }),
    'euiTimeOptions.roundToMonth': i18n.translate('core.euiTimeOptions.roundToMonth', {
      defaultMessage: 'Round to the month',
    }),
    'euiTimeOptions.roundToYear': i18n.translate('core.euiTimeOptions.roundToYear', {
      defaultMessage: 'Round to the year',
    }),
    'euiTimeOptions.today': i18n.translate('core.euiTimeOptions.today', {
      defaultMessage: 'Today',
    }),
    'euiTimeOptions.thisWeek': i18n.translate('core.euiTimeOptions.thisWeek', {
      defaultMessage: 'This week',
    }),
    'euiTimeOptions.thisMonth': i18n.translate('core.euiTimeOptions.thisMonth', {
      defaultMessage: 'This month',
    }),
    'euiTimeOptions.thisYear': i18n.translate('core.euiTimeOptions.thisYear', {
      defaultMessage: 'This year',
    }),
    'euiTimeOptions.yesterday': i18n.translate('core.euiTimeOptions.yesterday', {
      defaultMessage: 'Yesterday',
    }),
    'euiTimeOptions.weekToDate': i18n.translate('core.euiTimeOptions.weekToDate', {
      defaultMessage: 'Week to date',
    }),
    'euiTimeOptions.monthToDate': i18n.translate('core.euiTimeOptions.monthToDate', {
      defaultMessage: 'Month to date',
    }),
    'euiTimeOptions.yearToDate': i18n.translate('core.euiTimeOptions.yearToDate', {
      defaultMessage: 'Year to date',
    }),
    'euiQuickSelect.applyButton': i18n.translate('core.euiQuickSelect.applyButton', {
      defaultMessage: 'Apply',
    }),
    'euiTimeWindowButtons.invalidShiftLabel': i18n.translate(
      'core.euiTimeWindowButtons.invalidShiftLabel',
      { defaultMessage: 'Cannot shift invalid time window' }
    ),
    'euiTimeWindowButtons.invalidZoomOutLabel': i18n.translate(
      'core.euiTimeWindowButtons.invalidZoomOutLabel',
      { defaultMessage: 'Cannot zoom out invalid time window' }
    ),
    'euiTimeWindowButtons.previousLabel': i18n.translate(
      'core.euiTimeWindowButtons.previousLabel',
      { defaultMessage: 'Previous' }
    ),
    'euiTimeWindowButtons.previousDescription': ({ displayInterval }: EuiValues) =>
      i18n.translate('core.euiTimeWindowButtons.previousDescription', {
        defaultMessage: 'Previous {displayInterval}',
        values: { displayInterval },
      }),
    'euiTimeWindowButtons.zoomOutLabel': i18n.translate('core.euiTimeWindowButtons.zoomOutLabel', {
      defaultMessage: 'Zoom out',
    }),
    'euiTimeWindowButtons.nextLabel': i18n.translate('core.euiTimeWindowButtons.nextLabel', {
      defaultMessage: 'Next',
    }),
    'euiTimeWindowButtons.nextDescription': ({ displayInterval }: EuiValues) =>
      i18n.translate('core.euiTimeWindowButtons.nextDescription', {
        defaultMessage: 'Next {displayInterval}',
        values: { displayInterval },
      }),
    'euiTimeWindowButtons.invalidZoomInLabel': i18n.translate(
      'core.euiTimeWindowButtons.invalidZoomInLabel',
      { defaultMessage: 'Cannot zoom in invalid time window' }
    ),
    'euiTimeWindowButtons.cannotZoomInLabel': i18n.translate(
      'core.euiTimeWindowButtons.cannotZoomInLabel',
      { defaultMessage: 'Cannot zoom in any further' }
    ),
    'euiTimeWindowButtons.zoomInLabel': i18n.translate('core.euiTimeWindowButtons.zoomInLabel', {
      defaultMessage: 'Zoom in',
    }),
    'euiQuickSelect.fullDescription': ({ timeTense, timeValue, timeUnit }: EuiValues) =>
      i18n.translate('core.euiQuickSelect.fullDescription', {
        defaultMessage: 'Currently set to {timeTense} {timeValue} {timeUnit}.',
        values: { timeTense, timeValue, timeUnit },
      }),
    'euiQuickSelect.nextLabel': i18n.translate('core.euiQuickSelect.nextLabel', {
      defaultMessage: 'Next time window',
    }),
    'euiQuickSelect.previousLabel': i18n.translate('core.euiQuickSelect.previousLabel', {
      defaultMessage: 'Previous time window',
    }),
    'euiQuickSelect.quickSelectTitle': i18n.translate('core.euiQuickSelect.quickSelectTitle', {
      defaultMessage: 'Quick select',
    }),
    'euiQuickSelect.tenseLabel': i18n.translate('core.euiQuickSelect.tenseLabel', {
      defaultMessage: 'Time tense',
    }),
    'euiQuickSelect.unitLabel': i18n.translate('core.euiQuickSelect.unitLabel', {
      defaultMessage: 'Time unit',
    }),
    'euiQuickSelect.valueLabel': i18n.translate('core.euiQuickSelect.valueLabel', {
      defaultMessage: 'Time value',
    }),
    'euiQuickSelectPopover.buttonLabel': i18n.translate('core.euiQuickSelectPopover.buttonLabel', {
      defaultMessage: 'Date quick select',
    }),
    'euiRecentlyUsed.legend': i18n.translate('core.euiRecentlyUsed.legend', {
      defaultMessage: 'Recently used date ranges',
    }),
    'euiRefreshInterval.toggleLabel': i18n.translate('core.euiRefreshInterval.toggleLabel', {
      defaultMessage: 'Refresh every',
    }),
    'euiRefreshInterval.toggleAriaLabel': i18n.translate(
      'core.euiRefreshInterval.toggleAriaLabel',
      {
        defaultMessage: 'Toggle refresh',
      }
    ),
    'euiRefreshInterval.valueAriaLabel': i18n.translate('core.euiRefreshInterval.valueAriaLabel', {
      defaultMessage: 'Refresh interval value',
    }),
    'euiRefreshInterval.unitsAriaLabel': i18n.translate('core.euiRefreshInterval.unitsAriaLabel', {
      defaultMessage: 'Refresh interval units',
    }),
    'euiRefreshInterval.fullDescriptionOff': ({ optionValue, optionText }: EuiValues) =>
      i18n.translate('core.euiRefreshInterval.fullDescriptionOff', {
        defaultMessage: 'Refresh is off, interval set to {optionValue} {optionText}.',
        values: { optionValue, optionText },
      }),
    'euiRefreshInterval.fullDescriptionOn': ({ optionValue, optionText }: EuiValues) =>
      i18n.translate('core.euiRefreshInterval.fullDescriptionOn', {
        defaultMessage: 'Refresh is on, interval set to {optionValue} {optionText}.',
        values: { optionValue, optionText },
      }),
    'euiDatePopoverContent.startDateLabel': i18n.translate(
      'core.euiDatePopoverContent.startDateLabel',
      { defaultMessage: 'Start date' }
    ),
    'euiDatePopoverContent.endDateLabel': i18n.translate(
      'core.euiDatePopoverContent.endDateLabel',
      { defaultMessage: 'End date' }
    ),
    'euiDatePopoverContent.absoluteTabLabel': i18n.translate(
      'core.euiDatePopoverContent.absoluteTabLabel',
      { defaultMessage: 'Absolute' }
    ),
    'euiDatePopoverContent.relativeTabLabel': i18n.translate(
      'core.euiDatePopoverContent.relativeTabLabel',
      { defaultMessage: 'Relative' }
    ),
    'euiDatePopoverContent.nowTabLabel': i18n.translate('core.euiDatePopoverContent.nowTabLabel', {
      defaultMessage: 'Now',
    }),
    'euiDatePopoverContent.nowTabContent': i18n.translate(
      'core.euiDatePopoverContent.nowTabContent',
      {
        defaultMessage:
          'Setting the time to "now" means that on every refresh this time will be set to the time of the refresh.',
      }
    ),
    'euiDatePopoverContent.nowTabButtonStart': i18n.translate(
      'core.euiDatePopoverContent.nowTabButtonStart',
      { defaultMessage: 'Set start date and time to now' }
    ),
    'euiDatePopoverContent.nowTabButtonEnd': i18n.translate(
      'core.euiDatePopoverContent.nowTabButtonEnd',
      { defaultMessage: 'Set end date and time to now' }
    ),
    'euiAbsoluteTab.dateFormatError': ({ dateFormat }: EuiValues) =>
      i18n.translate('core.euiAbsoluteTab.dateFormatError', {
        defaultMessage: 'Allowed formats: {dateFormat}, ISO 8601, RFC 2822, or Unix timestamp.',
        values: { dateFormat },
      }),
    'euiRelativeTab.fullDescription': ({ unit }: EuiValues) =>
      i18n.translate('core.euiRelativeTab.fullDescription', {
        defaultMessage: 'The unit is changeable. Currently set to {unit}.',
        values: { unit },
      }),
    'euiRelativeTab.unitInputLabel': i18n.translate('core.euiRelativeTab.unitInputLabel', {
      defaultMessage: 'Relative time span',
    }),
    'euiRelativeTab.numberInputError': i18n.translate('core.euiRelativeTab.numberInputError', {
      defaultMessage: 'Must be >= 0',
    }),
    'euiRelativeTab.numberInputLabel': i18n.translate('core.euiRelativeTab.numberInputLabel', {
      defaultMessage: 'Time span amount',
    }),
    'euiRelativeTab.dateInputError': i18n.translate('core.euiRelativeTab.dateInputError', {
      defaultMessage: 'Must be a valid range',
    }),
    'euiAbsoluteTab.dateFormatButtonLabel': i18n.translate(
      'core.euiAbsoluteTab.dateFormatButtonLabel',
      {
        defaultMessage: 'Parse date',
      }
    ),
    'euiResizableButton.horizontalResizerAriaLabel': i18n.translate(
      'core.euiResizableButton.horizontalResizerAriaLabel',
      {
        defaultMessage: 'Press the left or right arrow keys to adjust panels size',
      }
    ),
    'euiResizableButton.verticalResizerAriaLabel': i18n.translate(
      'core.euiResizableButton.verticalResizerAriaLabel',
      {
        defaultMessage: 'Press the up or down arrow keys to adjust panels size',
      }
    ),
    'euiResizablePanel.toggleButtonAriaLabel': i18n.translate(
      'core.euiResizablePanel.toggleButtonAriaLabel',
      {
        defaultMessage: 'Press to toggle this panel',
      }
    ),
    'euiSaturation.screenReaderInstructions': i18n.translate(
      'core.euiSaturation.screenReaderInstructions',
      {
        defaultMessage:
          'Arrow keys to navigate the square color gradient. Coordinates will be used to calculate HSV color mode "saturation" and "value" numbers, in the range of 0 to 1. Left and right to change the saturation. Up and down change the value.',
      }
    ),
    'euiSaturation.ariaLabel': i18n.translate('core.euiSaturation.ariaLabel', {
      defaultMessage: 'Select a color',
    }),
    'euiSearchBox.ariaLabel': i18n.translate('core.euiSearchBox.ariaLabel', {
      defaultMessage:
        'This is a search bar. After typing your query, hit enter to filter the results lower in the page.',
    }),
    'euiSearchBox.incrementalAriaLabel': i18n.translate('core.euiSearchBox.incrementalAriaLabel', {
      defaultMessage:
        'This is a search bar. As you type, the results lower in the page will automatically filter.',
    }),
    'euiSearchBox.placeholder': i18n.translate('core.euiSearchBox.placeholder', {
      defaultMessage: 'Search...',
    }),
    'euiSelectable.loadingOptions': i18n.translate('core.euiSelectable.loadingOptions', {
      defaultMessage: 'Loading options',
      description: 'Placeholder message while data is asynchronously loaded',
    }),
    'euiSelectable.noAvailableOptions': i18n.translate('core.euiSelectable.noAvailableOptions', {
      defaultMessage: 'No options available',
    }),
    'euiSelectable.noMatchingOptions': ({ searchValue }: EuiValues) =>
      i18n.translate('core.euiSelectable.noMatchingOptions', {
        defaultMessage: "{searchValue} doesn't match any options",
        values: { searchValue },
      }),
    'euiSelectable.screenReaderInstructions': i18n.translate(
      'core.euiSelectable.screenReaderInstructions',
      {
        defaultMessage:
          'Use the Up and Down arrow keys to move focus over options. Press Enter to select. Press Escape to collapse options.',
      }
    ),
    'euiSelectable.searchResults': ({ resultsLength }: EuiValues) =>
      i18n.translate('core.euiSelectable.searchResults', {
        defaultMessage: '{resultsLength, plural, one {# result} other {# results}} available',
        values: { resultsLength },
      }),
    'euiSelectable.placeholderName': i18n.translate('core.euiSelectable.placeholderName', {
      defaultMessage: 'Filter options',
    }),
    'euiSelectableListItem.checkedOption': i18n.translate(
      'core.euiSelectableListItem.checkedOption',
      {
        defaultMessage: 'Checked option.',
      }
    ),
    'euiSelectableListItem.excludedOption': i18n.translate(
      'core.euiSelectableListItem.excludedOption',
      {
        defaultMessage: 'Excluded option.',
      }
    ),
    'euiSelectableListItem.checkOptionInstructions': i18n.translate(
      'core.euiSelectableListItem.checkOptionInstructions',
      {
        defaultMessage: 'To check this option, press Enter.',
      }
    ),
    'euiSelectableListItem.uncheckOptionInstructions': i18n.translate(
      'core.euiSelectableListItem.uncheckOptionInstructions',
      {
        defaultMessage: 'To uncheck this option, press Enter.',
      }
    ),
    'euiSelectableListItem.excludeOptionInstructions': i18n.translate(
      'core.euiSelectableListItem.excludeOptionInstructions',
      {
        defaultMessage: 'To exclude this option, press Enter.',
      }
    ),
    'euiSelectableListItem.mixedOption': i18n.translate('core.euiSelectableListItem.mixedOption', {
      defaultMessage: 'Mixed (indeterminate) option.',
    }),

    'euiSelectableListItem.mixedOptionInstructions': i18n.translate(
      'core.euiSelectableListItem.mixedOptionInstructions',
      {
        defaultMessage: 'To check this option for all, press Enter once.',
      }
    ),
    'euiSelectableListItem.mixedOptionUncheckInstructions': i18n.translate(
      'core.euiSelectableListItem.mixedOptionUncheckInstructions',
      {
        defaultMessage: 'To uncheck this option for all, press Enter twice.',
      }
    ),
    'euiSelectableListItem.mixedOptionExcludeInstructions': i18n.translate(
      'core.euiSelectableListItem.mixedOptionExcludeInstructions',
      {
        defaultMessage: 'To exclude this option for all, press Enter twice.',
      }
    ),
    'euiSelectableTemplateSitewide.loadingResults': i18n.translate(
      'core.euiSelectableTemplateSitewide.loadingResults',
      {
        defaultMessage: 'Loading results',
      }
    ),
    'euiSelectableTemplateSitewide.noResults': i18n.translate(
      'core.euiSelectableTemplateSitewide.noResults',
      {
        defaultMessage: 'No results available',
      }
    ),
    'euiSelectableTemplateSitewide.onFocusBadgeGoTo': i18n.translate(
      'core.euiSelectableTemplateSitewide.onFocusBadgeGoTo',
      {
        defaultMessage: 'Go to',
      }
    ),
    'euiSelectableTemplateSitewide.searchPlaceholder': i18n.translate(
      'core.euiSelectableTemplateSitewide.searchPlaceholder',
      {
        defaultMessage: 'Search for anything...',
      }
    ),
    'euiSideNav.mobileToggleAriaLabel': i18n.translate('core.euiSideNav.mobileToggleAriaLabel', {
      defaultMessage: 'Toggle navigation',
    }),
    'euiStat.loadingText': i18n.translate('core.euiStat.loadingText', {
      defaultMessage: 'Statistic is loading',
    }),
    'euiStepStrings.step': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.step', {
        defaultMessage: 'Step {number}: {title}',
        values: { number, title },
      }),
    'euiStepStrings.simpleStep': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleStep', {
        defaultMessage: 'Step {number}',
        values: { number },
      }),
    'euiStepStrings.complete': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.complete', {
        defaultMessage: 'Step {number}: {title} is complete',
        values: { number, title },
      }),
    'euiStepStrings.current': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.current', {
        defaultMessage: 'Current step {number}: {title}',
        values: { number, title },
      }),
    'euiStepStrings.simpleComplete': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleComplete', {
        defaultMessage: 'Step {number} is complete',
        values: { number },
      }),
    'euiStepStrings.simpleCurrent': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleCurrent', {
        defaultMessage: 'Current step is {number}',
        values: { number },
      }),
    'euiStepStrings.warning': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.warning', {
        defaultMessage: 'Step {number}: {title} has warnings',
        values: { number, title },
      }),
    'euiStepStrings.simpleWarning': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleWarning', {
        defaultMessage: 'Step {number} has warnings',
        values: { number },
      }),
    'euiStepStrings.errors': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.errors', {
        defaultMessage: 'Step {number}: {title} has errors',
        values: { number, title },
      }),
    'euiStepStrings.simpleErrors': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleErrors', {
        defaultMessage: 'Step {number} has errors',
        values: { number },
      }),
    'euiStepStrings.incomplete': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.incomplete', {
        defaultMessage: 'Step {number}: {title} is incomplete',
        values: { number, title },
      }),
    'euiStepStrings.simpleIncomplete': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleIncomplete', {
        defaultMessage: 'Step {number} is incomplete',
        values: { number },
      }),
    'euiStepStrings.disabled': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.disabled', {
        defaultMessage: 'Step {number}: {title} is disabled',
        values: { number, title },
      }),
    'euiStepStrings.simpleDisabled': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleDisabled', {
        defaultMessage: 'Step {number} is disabled',
        values: { number },
      }),
    'euiStepStrings.loading': ({ number, title }: EuiValues) =>
      i18n.translate('core.euiStepStrings.loading', {
        defaultMessage: 'Step {number}: {title} is loading',
        values: { number, title },
      }),
    'euiStepStrings.simpleLoading': ({ number }: EuiValues) =>
      i18n.translate('core.euiStepStrings.simpleLoading', {
        defaultMessage: 'Step {number} is loading',
        values: { number },
      }),
    'euiSuperSelect.screenReaderAnnouncement': i18n.translate(
      'core.euiSuperSelect.screenReaderAnnouncement',
      {
        defaultMessage:
          'You are in a form selector and must select a single option. Use the Up and Down arrow keys to navigate or Escape to close.',
      }
    ),
    'euiSuperUpdateButton.cannotUpdateTooltip': i18n.translate(
      'core.euiSuperUpdateButton.cannotUpdateTooltip',
      {
        defaultMessage: 'Cannot update',
        description: "Displayed in a tooltip when updates can't happen",
      }
    ),
    'euiSuperUpdateButton.clickToApplyTooltip': i18n.translate(
      'core.euiSuperUpdateButton.clickToApplyTooltip',
      {
        defaultMessage: 'Click to apply',
        description: "Displayed in a tooltip when there are changes that haven't been applied",
      }
    ),
    'euiSuperUpdateButton.refreshButtonLabel': i18n.translate(
      'core.euiSuperUpdateButton.refreshButtonLabel',
      {
        defaultMessage: 'Refresh',
        description: 'Displayed in a button that refreshes based on date picked',
      }
    ),
    'euiSuperUpdateButton.updatingButtonLabel': i18n.translate(
      'core.euiSuperUpdateButton.updatingButtonLabel',
      {
        defaultMessage: 'Updating',
        description: 'Displayed in a button that refreshes when updates are happening',
      }
    ),
    'euiSuperUpdateButton.updateButtonLabel': i18n.translate(
      'core.euiSuperUpdateButton.updateButtonLabel',
      {
        defaultMessage: 'Update',
        description: 'Displayed in a button that updates based on date picked',
      }
    ),
    'euiTableHeaderCell.titleTextWithDesc': ({ innerText, description }: EuiValues) =>
      i18n.translate('core.euiTableHeaderCell.titleTextWithDesc', {
        defaultMessage: '{innerText}; {description}',
        values: { innerText, description },
        description: 'Displayed in a cell in the header of the table to describe the field',
      }),
    'euiTablePagination.allRows': i18n.translate('core.euiTablePagination.allRows', {
      defaultMessage: 'Showing all rows',
      description: 'Displayed in a button that toggles a table pagination menu',
    }),
    'euiTablePagination.rowsPerPage': i18n.translate('core.euiTablePagination.rowsPerPage', {
      defaultMessage: 'Rows per page',
      description: 'Displayed in a button that toggles a table pagination menu',
    }),
    'euiTablePagination.rowsPerPageOption': ({ rowsPerPage }: EuiValues) =>
      i18n.translate('core.euiTablePagination.rowsPerPageOption', {
        defaultMessage: '{rowsPerPage} rows',
        description: 'Displayed in a button that toggles the number of visible rows',
        values: { rowsPerPage },
      }),
    'euiTablePagination.rowsPerPageOptionShowAllRows': i18n.translate(
      'core.euiTablePagination.rowsPerPageOptionShowAllRows',
      {
        defaultMessage: 'Show all rows',
        description: 'Displayed in a button that toggles the number of visible rows',
      }
    ),
    'euiTableSortMobile.sorting': i18n.translate('core.euiTableSortMobile.sorting', {
      defaultMessage: 'Sorting',
      description: 'Displayed in a button that toggles a table sorting menu',
    }),
    'euiToast.dismissToast': i18n.translate('core.euiToast.dismissToast', {
      defaultMessage: 'Dismiss toast',
    }),
    'euiToast.newNotification': i18n.translate('core.euiToast.newNotification', {
      defaultMessage: 'A new notification appears',
    }),
    'euiToast.notification': i18n.translate('core.euiToast.notification', {
      defaultMessage: 'Notification',
      description: 'ARIA label on an element containing a notification',
    }),
    'euiTourFooter.endTour': i18n.translate('core.euiTourFooter.endTour', {
      defaultMessage: 'End tour',
    }),
    'euiTourFooter.skipTour': i18n.translate('core.euiTourFooter.skipTour', {
      defaultMessage: 'Skip tour',
    }),
    'euiTourFooter.closeTour': i18n.translate('core.euiTourFooter.closeTour', {
      defaultMessage: 'Close tour',
    }),
    'euiTourStepIndicator.isActive': i18n.translate('core.euiTourStepIndicator.isActive', {
      defaultMessage: 'active',
      description: 'Text for an active tour step',
    }),
    'euiTourStepIndicator.isComplete': i18n.translate('core.euiTourStepIndicator.isComplete', {
      defaultMessage: 'complete',
      description: 'Text for a completed tour step',
    }),
    'euiTourStepIndicator.isIncomplete': i18n.translate('core.euiTourStepIndicator.isIncomplete', {
      defaultMessage: 'incomplete',
      description: 'Text for an incomplete tour step',
    }),
    'euiTourStepIndicator.ariaLabel': ({ status, number }: EuiValues) =>
      i18n.translate('core.euiTourStepIndicator.ariaLabel', {
        defaultMessage: 'Step {number} {status}',
        values: { status, number },
        description: 'Screen reader text describing the state of a tour step',
      }),
    'euiTreeView.listNavigationInstructions': i18n.translate(
      'core.euiTreeView.listNavigationInstructions',
      {
        defaultMessage: 'You can quickly navigate this list using arrow keys.',
      }
    ),
    'euiSkeletonLoading.loadingAriaText': ({ contentAriaLabel }: EuiValues) =>
      i18n.translate('core.euiSkeletonLoading.loadingAriaText', {
        defaultMessage: 'Loading {contentAriaLabel}',
        values: { contentAriaLabel },
      }),
    'euiSkeletonLoading.loadedAriaText': ({ contentAriaLabel }: EuiValues) =>
      i18n.translate('core.euiSkeletonLoading.loadedAriaText', {
        defaultMessage: 'Loaded {contentAriaLabel}',
        values: { contentAriaLabel },
      }),
    'euiDualRange.sliderScreenReaderInstructions': i18n.translate(
      'core.euiDualRange.sliderScreenReaderInstructions',
      {
        defaultMessage:
          'You are in a custom range slider. Use the Up and Down arrow keys to change the minimum value. Press Tab to interact with the maximum value.',
        description: 'Screen reader instructions for changing dual range slider values.',
      }
    ),
    'euiRange.sliderScreenReaderInstructions': i18n.translate(
      'core.euiRange.sliderScreenReaderInstructions',
      {
        defaultMessage:
          'You are in a custom range slider. Use the Up and Down arrow keys to change the value.',
        description: 'Screen reader instructions for changing range slider values.',
      }
    ),
    'euiSuperSelect.ariaLabel': i18n.translate('core.euiSuperSelect.ariaLabel', {
      defaultMessage: 'Select listbox',
      description: 'Accessible label for Super Selects without a visible label.',
    }),
    'euiFieldValueSelectionFilter.buttonLabelHint': i18n.translate(
      'core.euiFieldValueSelectionFilter.buttonLabelHint',
      {
        defaultMessage: 'Selection',
      }
    ),
    'euiCodeBlockFullScreen.ariaLabel': i18n.translate('core.euiCodeBlockFullScreen.ariaLabel', {
      defaultMessage: 'Expanded code block',
    }),
    'euiCodeBlock.label': ({ language }: EuiValues) =>
      i18n.translate('core.euiCodeBlock.label', {
        defaultMessage: '{language} code block:',
        values: { language },
      }),
    'euiSaturation.roleDescription': i18n.translate('core.euiSaturation.roleDescription', {
      defaultMessage: 'HSV color mode saturation and value 2-axis slider.',
    }),
    'euiHue.ariaValueText': i18n.translate('core.euiHue.ariaValueText', {
      defaultMessage: 'Hue',
    }),
    'euiHue.ariaRoleDescription': i18n.translate('core.euiHue.ariaRoleDescription', {
      defaultMessage: 'Hue slider',
    }),
    'euiColorPicker.selectedColorLabel': i18n.translate('core.euiColorPicker.selectedColorLabel', {
      defaultMessage: 'Selected color',
    }),
    'euiContextMenuPanelTitle.ariaLabel': i18n.translate(
      'core.euiContextMenuPanelTitle.ariaLabel',
      {
        defaultMessage: 'Close current panel:',
      }
    ),
    'euiBanner.dismissAriaLabel': ({ title }: EuiValues) =>
      i18n.translate('core.euiBanner.dismissAriaLabel', {
        defaultMessage: 'Dismiss "{title}" announcement',
        values: {
          title,
        },
      }),
  };
};
