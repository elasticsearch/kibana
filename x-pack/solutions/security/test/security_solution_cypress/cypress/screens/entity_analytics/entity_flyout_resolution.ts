/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getDataTestSubjectSelector } from '../../helpers/common';

// Mirrors the production constants from
// `x-pack/solutions/security/plugins/security_solution/public/entity_analytics/components/entity_resolution/test_ids.ts`
// (PREFIX = 'securitySolutionFlyout'). Kept as plain strings to avoid a
// cross-module import from cypress into the plugin's public surface.

// Right-panel ResolutionSection (EuiAccordion wrapper)
export const RESOLUTION_SECTION = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionSection'
);

// Right-panel "Resolution group" link inside the section header.
// ExpandablePanel suffixes its data-test-subj with `TitleLink` for the EuiLink.
export const RESOLUTION_GROUP_LINK = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionGroupLinkTitleLink'
);

// Right-panel populated group table
export const RESOLUTION_GROUP_TABLE = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionGroupTable'
);

// Primary-entity icon (the "aggregate" tooltip in the Entity-name cell of the
// primary row) — present only on the primary row of the resolution group.
export const RESOLUTION_PRIMARY_ENTITY_ICON = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionPrimaryEntityIcon'
);

// Empty-state table (rendered when group_size === 1)
export const RESOLUTION_EMPTY_STATE = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionEmptyState'
);

// Left-panel tab button (in the tab list above the content)
export const RESOLUTION_GROUP_TAB = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionGroupTab'
);

// Left-panel resolution tab content body
export const RESOLUTION_GROUP_TAB_CONTENT = getDataTestSubjectSelector(
  'securitySolutionFlyoutResolutionGroupTabContent'
);

// Left-panel "Add entities" accordion (collapsed by default)
export const ADD_ENTITIES_ACCORDION = getDataTestSubjectSelector(
  'securitySolutionFlyoutAddEntitiesAccordion'
);

// Inner accordion contents wrapper (search field + counter + table)
export const ADD_ENTITIES_SECTION = getDataTestSubjectSelector(
  'securitySolutionFlyoutAddEntitiesSection'
);

// "Search by entity name or ID" input
export const ADD_ENTITIES_SEARCH = getDataTestSubjectSelector(
  'securitySolutionFlyoutAddEntitiesSearch'
);

// Paginated EuiBasicTable of search results
export const ADD_ENTITIES_TABLE = getDataTestSubjectSelector(
  'securitySolutionFlyoutAddEntitiesTable'
);

// "Showing **range** of **total** entities" counter
export const ADD_ENTITIES_SHOWING = getDataTestSubjectSelector(
  'securitySolutionFlyoutAddEntitiesShowing'
);

// Confirm-resolution modal (shown on the first link to a solo entity)
export const CONFIRM_RESOLUTION_MODAL = getDataTestSubjectSelector(
  'securitySolutionFlyoutConfirmResolutionModal'
);

// Reusable EUI selectors used by the spec
export const EUI_BASIC_TABLE_ROW = '.euiTableRow';
export const EUI_TABLE_PAGINATION_PAGE_SIZE_BUTTON =
  '[data-test-subj="tablePaginationPopoverButton"]';
export const EUI_TABLE_PAGINATION_PAGE_SIZE_OPTION = (size: number) =>
  `[data-test-subj="tablePagination-${size}-rows"]`;

// Add-entity (plus) and remove-entity (cross) icon buttons in the row Actions column.
// EUI's EuiButtonIcon exposes the `aria-label` we pass in `aria-label`, while
// EUI also reflects it as the test subject in some configurations; we target
// via aria-label which mirrors the i18n strings ADD_ENTITY_BUTTON / REMOVE_ENTITY_BUTTON.
export const ADD_ENTITY_BUTTON_ARIA = 'Add to resolution group';
export const REMOVE_ENTITY_BUTTON_ARIA = 'Remove from resolution group';

// Confirm-modal radio option ids (exposed on the underlying input by EuiRadioGroup)
export const CONFIRM_MODAL_RADIO_CURRENT_AS_TARGET = '[id="current_as_target"]';
export const CONFIRM_MODAL_RADIO_NEW_AS_TARGET = '[id="new_as_target"]';

// Toast helpers
export const TOASTER_HEADER = '[data-test-subj="euiToastHeader__title"]';
export const TOASTER_BODY = '[data-test-subj="euiToastBody"]';
export const TOAST_CLOSE_BUTTON = '[data-test-subj="toastCloseButton"]';
