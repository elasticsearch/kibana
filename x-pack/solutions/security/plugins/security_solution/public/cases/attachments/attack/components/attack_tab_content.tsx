/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type {
  EuiDataGridCellValueElementProps,
  EuiDataGridColumn,
  EuiDataGridColumnSortingConfig,
  EuiDataGridControlColumn,
  EuiDataGridSorting,
  EuiDataGridStyle,
  EuiDataGridToolBarVisibilityOptions,
} from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiCheckbox,
  EuiDataGrid,
  EuiEmptyPrompt,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiProgress,
  EuiTextColor,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { isNonLocalIndexName } from '@kbn/es-query';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import type { CommonAttachmentListViewProps } from '@kbn/cases-plugin/public';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { replaceAnonymizedValuesWithOriginalValues } from '@kbn/elastic-assistant-common';
import type { AttackAttachmentMetadata } from '../../../../../common/cases/attachments/attack';
import {
  ATTACK_TAB_COLUMN_ACTIONS_TEST_ID,
  ATTACK_TAB_COLUMN_ALERTS_TEST_ID,
  ATTACK_TAB_COLUMN_ATTACHED_AT_TEST_ID,
  ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID,
  ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID,
  ATTACK_TAB_COLUMN_RISK_SCORE_TEST_ID,
  ATTACK_TAB_COLUMN_STATUS_TEST_ID,
  ATTACK_TAB_COLUMN_SUMMARY_TEST_ID,
  ATTACK_TAB_COLUMN_TITLE_TEST_ID,
  ATTACK_TAB_EMPTY_TEST_ID,
  ATTACK_TAB_GRID_TEST_ID,
  ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID,
  ATTACK_TAB_ROW_MORE_ACTIONS_TEST_ID,
  ATTACK_TAB_ROW_SELECT_TEST_ID,
  ATTACK_TAB_ROW_STATUS_TEST_ID,
  ATTACK_TAB_ROW_TITLE_TEST_ID,
  ATTACK_TAB_ROW_UNRESOLVED_TEST_ID,
  ATTACK_TAB_SELECT_ALL_TEST_ID,
  ATTACK_TAB_TABLE_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { useKibana } from '../../../../common/lib/kibana';
import { useAssistantAvailability } from '../../../../assistant/use_assistant_availability';
import { useFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { getSummaryPlainText } from '../../../../attack_discovery/components/attack_entity_summary';
import { FormattedDate } from '../../../../common/components/formatted_date';
import { getEmptyValue } from '../../../../common/components/empty_value';
import { getActionsColumnWidth } from '../../../../common/components/header_actions/helpers';
import { TruncatableText } from '../../../../common/components/truncatable_text';
import { RuleStatus } from '../../../../timelines/components/timeline/body/renderers/rule_status';
import { AttackTitleLink } from './attack_title_link';
import { ShowAttackButton } from './show_attack_button';
import { AttacksGroupTakeActionItems } from '../../../../detections/components/attacks/table/attacks_group_take_action_items';
import { InvestigateAttackInTimelineButton } from './investigate_attack_in_timeline_button';
import { useInvestigateAttackInTimeline } from '../hooks/use_investigate_attack_in_timeline';
import type { SelectedAttack } from './attack_tab_bulk_actions';
import { AttackTabBulkActions } from './attack_tab_bulk_actions';
import type { AttackCaseAttachmentRow, AttackTabColumnId } from '../utils';
import {
  ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY,
  ATTACK_TAB_COLUMN_ID,
  getAttackAlertIds,
  isAttackAttachment,
  matchesSearchTerm,
  toVisibleAttackTabColumnIds,
} from '../utils';

/** One attached attack: the snapshot persisted on the attachment, plus the live document when it resolves. */
interface AttackRow {
  /** The attack document `_id`, persisted as the attachment id. */
  attachmentId: string;
  /** The attachment saved object id, used to key the row and the navigation button. */
  savedObjectId: string;
  metadata: AttackAttachmentMetadata;
  createdAt: string;
  attachedBy: string;
  /** The live attack document. Absent while the query runs and when the id cannot be resolved. */
  attack?: AttackDiscoveryAlert;
  /** True once the live query has settled without returning this attack. */
  isUnresolved: boolean;
}

/**
 * What the grid's cells render from. Passed through context rather than closed over by the render
 * functions, because `EuiDataGrid` renders those as component types: a render function rebuilt
 * when the rows or the selection change is a new component to React, so every cell would unmount
 * — taking an open removal prompt with it.
 */
interface AttackGridCellContextValue {
  areAllRowsSelected: boolean;
  canInvestigateInTimeline: boolean;
  investigateAttackInTimeline: (attack: AttackDiscoveryAlert | undefined) => void;
  rows: AttackRow[];
  selectedRowCount: number;
  selectedRowIds: ReadonlySet<string>;
  toggleAllRowsSelected: () => void;
  toggleRowSelected: (savedObjectId: string) => void;
}

const AttackGridCellContext = createContext<AttackGridCellContextValue | null>(null);

const useAttackGridCellContext = (): AttackGridCellContextValue => {
  const cellContext = useContext(AttackGridCellContext);

  if (cellContext == null) {
    throw new Error('The attacks grid cells must be rendered inside AttackGridCellContext');
  }

  return cellContext;
};

/** Matches the alerts grid directly above this section in the tab. */
const GRID_STYLE: EuiDataGridStyle = {
  border: 'none',
  fontSize: 's',
  header: 'underline',
};

/**
 * Matches the alerts grid. `EuiDataGrid` has no grouping or CSV export of its own to hide.
 * The bulk action bar is appended to this at render time, once there is a selection to act on.
 */
const TOOLBAR_VISIBILITY: EuiDataGridToolBarVisibilityOptions = {
  showColumnSelector: true,
  showSortSelector: true,
  showDisplaySelector: false,
  showFullScreenSelector: false,
};

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

/**
 * Wide enough for the three row actions, sized by the helper the alerts grid's actions column
 * uses so the two columns line up.
 */
const ACTIONS_COLUMN_WIDTH = getActionsColumnWidth(3);

/**
 * The selection control column's id. It is deliberately not an `ATTACK_TAB_COLUMN_ID`: those
 * key the user's persisted column selection, and this column is never pickable.
 */
const SELECTION_COLUMN_ID = 'selection';
const SELECTION_COLUMN_WIDTH = 36;

/** Shared so clearing the selection never re-renders a grid that already has none. */
const NO_SELECTION: ReadonlySet<string> = new Set();

const UNKNOWN_USER = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.tab.unknownUser',
  {
    defaultMessage: 'Unknown',
  }
);

const TABLE_CAPTION = i18n.translate('xpack.securitySolution.attackDiscovery.cases.tab.caption', {
  defaultMessage: 'Attacks attached to this case',
});

const SELECT_ALL_LABEL = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.tab.selectAllAttacksAriaLabel',
  {
    defaultMessage: 'Select all attacks',
  }
);

const getSelectAttackLabel = (attackTitle: string): string =>
  i18n.translate('xpack.securitySolution.attackDiscovery.cases.tab.selectAttackAriaLabel', {
    defaultMessage: 'Select {attackTitle}',
    values: { attackTitle },
  });

const UNRESOLVED_TOOLTIP = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.tab.unresolvedTooltip',
  {
    defaultMessage:
      'This attack could not be loaded. It may have been deleted, aged into a frozen tier, or be outside your access. The details shown were captured when it was attached.',
  }
);

const MORE_ACTIONS_LABEL = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.tab.moreActions',
  {
    defaultMessage: 'More attack actions',
  }
);

/** The telemetry source every action taken from this grid is attributed to. */
const TELEMETRY_SOURCE = 'case_attachment_table';

const COLUMN_HEADERS: Record<AttackTabColumnId, string> = {
  [ATTACK_TAB_COLUMN_ID.actions]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.actionsColumn',
    { defaultMessage: 'Actions' }
  ),
  [ATTACK_TAB_COLUMN_ID.detectedOn]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.detectedOnColumn',
    { defaultMessage: 'Detected on' }
  ),
  [ATTACK_TAB_COLUMN_ID.title]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.titleColumn',
    { defaultMessage: 'Title' }
  ),
  [ATTACK_TAB_COLUMN_ID.alerts]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.alertsColumn',
    { defaultMessage: 'Alerts' }
  ),
  [ATTACK_TAB_COLUMN_ID.summary]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.summaryColumn',
    { defaultMessage: 'Summary' }
  ),
  [ATTACK_TAB_COLUMN_ID.riskScore]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.riskScoreColumn',
    { defaultMessage: 'Risk score' }
  ),
  [ATTACK_TAB_COLUMN_ID.status]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.statusColumn',
    { defaultMessage: 'Status' }
  ),
  [ATTACK_TAB_COLUMN_ID.attachedBy]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.attachedByColumn',
    { defaultMessage: 'Attached by' }
  ),
  [ATTACK_TAB_COLUMN_ID.attachedAt]: i18n.translate(
    'xpack.securitySolution.attackDiscovery.cases.tab.attachedAtColumn',
    { defaultMessage: 'Attached at' }
  ),
};

const CELL_TEST_IDS: Record<AttackTabColumnId, string> = {
  [ATTACK_TAB_COLUMN_ID.actions]: ATTACK_TAB_COLUMN_ACTIONS_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.detectedOn]: ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.title]: ATTACK_TAB_COLUMN_TITLE_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.alerts]: ATTACK_TAB_COLUMN_ALERTS_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.summary]: ATTACK_TAB_COLUMN_SUMMARY_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.riskScore]: ATTACK_TAB_COLUMN_RISK_SCORE_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.status]: ATTACK_TAB_COLUMN_STATUS_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.attachedBy]: ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID,
  [ATTACK_TAB_COLUMN_ID.attachedAt]: ATTACK_TAB_COLUMN_ATTACHED_AT_TEST_ID,
};

/**
 * `actions` is absent: it is a leading control column, which the grid renders outside the
 * visible-column list and therefore outside the column picker.
 */
const GRID_COLUMNS: EuiDataGridColumn[] = [
  {
    id: ATTACK_TAB_COLUMN_ID.detectedOn,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.detectedOn],
    initialWidth: 200,
    isExpandable: false,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.title,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.title],
    initialWidth: 320,
    isExpandable: false,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.alerts,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.alerts],
    initialWidth: 90,
    isExpandable: false,
  },
  {
    // The only expandable column: its value is prose the cell can only show one line of.
    id: ATTACK_TAB_COLUMN_ID.summary,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.summary],
    isSortable: false,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.riskScore,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.riskScore],
    initialWidth: 110,
    isExpandable: false,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.status,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.status],
    initialWidth: 130,
    isExpandable: false,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.attachedBy,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.attachedBy],
    initialWidth: 160,
    isExpandable: false,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.attachedAt,
    displayAsText: COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.attachedAt],
    initialWidth: 200,
    isExpandable: false,
  },
];

const DEFAULT_SORTING: EuiDataGridColumnSortingConfig[] = [
  { id: ATTACK_TAB_COLUMN_ID.detectedOn, direction: 'desc' },
];

/** Clips the summary to the single line the row is tall, matching the alerts grid's rule cell. */
const truncateCss = css`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

/**
 * The fields the date cells name in their tooltip, so a date reads the same here as it does in
 * the alerts grid: the attack document's own timestamp, and the attachment's creation time.
 */
const DETECTED_ON_FIELD_NAME = '@timestamp';
const ATTACHED_AT_FIELD_NAME = 'created_at';

const getAttachedBy = (createdBy: AttackCaseAttachmentRow['createdBy']): string =>
  createdBy?.fullName || createdBy?.username || createdBy?.email || UNKNOWN_USER;

/**
 * Prefers the live attack title, de-anonymised, and falls back to the snapshot taken at attach
 * time so a row still names its attack when the document cannot be resolved.
 */
const getTitle = (
  attack: AttackDiscoveryAlert | undefined,
  metadata: AttackAttachmentMetadata
): string => {
  if (attack == null) {
    return metadata.title;
  }
  // `_find` is queried with `with_replacements: false`, so live titles arrive anonymised.
  return replaceAnonymizedValuesWithOriginalValues({
    messageContent: attack.title,
    replacements: attack.replacements,
  });
};

/**
 * The time the attack itself was detected, which is not the time it was attached to the case.
 * `undefined` for an attachment written before the snapshot carried a timestamp.
 */
const getDetectedOn = (
  attack: AttackDiscoveryAlert | undefined,
  metadata: AttackAttachmentMetadata
): string | undefined => {
  const timestamp = attack?.timestamp ?? metadata.timestamp;
  return timestamp != null && timestamp.length > 0 ? timestamp : undefined;
};

/**
 * The attack summary as plain text, with the `{{ field value }}` tokens the markdown carries
 * reduced to their values so no markdown syntax reaches the cell.
 *
 * The live summary is de-anonymised here; the snapshot was de-anonymised at attach time, so
 * de-anonymising it again would rewrite any of its words that happen to be a replacement key.
 */
const getSummary = (
  attack: AttackDiscoveryAlert | undefined,
  metadata: AttackAttachmentMetadata
): string | undefined => {
  const liveMarkdown = attack?.summaryMarkdown;

  if (liveMarkdown != null && liveMarkdown.length > 0) {
    return getSummaryPlainText(
      replaceAnonymizedValuesWithOriginalValues({
        messageContent: liveMarkdown,
        replacements: attack?.replacements,
      })
    );
  }

  const snapshotMarkdown = metadata.summaryMarkdown;

  return snapshotMarkdown != null && snapshotMarkdown.length > 0
    ? getSummaryPlainText(snapshotMarkdown)
    : undefined;
};

const getAlertCount = (
  attack: AttackDiscoveryAlert | undefined,
  metadata: AttackAttachmentMetadata
): number | undefined => attack?.alertIds?.length ?? metadata.alertCount;

const getRiskScore = (
  attack: AttackDiscoveryAlert | undefined,
  metadata: AttackAttachmentMetadata
): number | undefined => attack?.riskScore ?? metadata.riskScore;

/** The value a column sorts on, or `undefined` when the row has nothing to sort by. */
const getSortValue = (
  { attack, metadata, attachedBy, createdAt }: AttackRow,
  columnId: string
): string | number | undefined => {
  switch (columnId) {
    case ATTACK_TAB_COLUMN_ID.detectedOn:
      return getDetectedOn(attack, metadata);
    case ATTACK_TAB_COLUMN_ID.title:
      return getTitle(attack, metadata);
    case ATTACK_TAB_COLUMN_ID.alerts:
      return getAlertCount(attack, metadata);
    case ATTACK_TAB_COLUMN_ID.riskScore:
      return getRiskScore(attack, metadata);
    case ATTACK_TAB_COLUMN_ID.status:
      return attack?.alertWorkflowStatus;
    case ATTACK_TAB_COLUMN_ID.attachedBy:
      return attachedBy;
    case ATTACK_TAB_COLUMN_ID.attachedAt:
      return createdAt;
    default:
      return undefined;
  }
};

const compareBySortColumn = (
  a: AttackRow,
  b: AttackRow,
  { id, direction }: EuiDataGridColumnSortingConfig
): number => {
  const left = getSortValue(a, id);
  const right = getSortValue(b, id);

  if (left == null && right == null) {
    return 0;
  }
  // A row with nothing to sort by is ordered last whichever way the column is sorted — hence
  // ahead of the direction flip — so an attachment written before the metadata carried the
  // field never displaces one that has it.
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }

  const order =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : String(left).localeCompare(String(right));

  return direction === 'asc' ? order : -order;
};

/**
 * Sorts client-side over the merged rows, because half of what a row is made of — the
 * attachment provenance, and the snapshot an unresolved row falls back to — exists only here.
 */
const compareRows = (
  a: AttackRow,
  b: AttackRow,
  sortingColumns: EuiDataGridColumnSortingConfig[]
): number => {
  for (const sortingColumn of sortingColumns) {
    const order = compareBySortColumn(a, b, sortingColumn);
    if (order !== 0) {
      return order;
    }
  }

  return 0;
};

const SelectAllAttacksHeaderCell = () => {
  const { areAllRowsSelected, selectedRowCount, toggleAllRowsSelected } =
    useAttackGridCellContext();

  const selectAllId = useGeneratedHtmlId({ prefix: 'attackTabSelectAll' });

  return (
    <EuiCheckbox
      aria-label={SELECT_ALL_LABEL}
      checked={areAllRowsSelected}
      data-test-subj={ATTACK_TAB_SELECT_ALL_TEST_ID}
      id={selectAllId}
      indeterminate={selectedRowCount > 0 && !areAllRowsSelected}
      onChange={toggleAllRowsSelected}
    />
  );
};

SelectAllAttacksHeaderCell.displayName = 'SelectAllAttacksHeaderCell';

const SelectAttackCell = ({ rowIndex }: EuiDataGridCellValueElementProps) => {
  const { rows, selectedRowIds, toggleRowSelected } = useAttackGridCellContext();

  const row = rows[rowIndex];

  if (row == null) {
    return null;
  }

  return (
    <EuiCheckbox
      aria-label={getSelectAttackLabel(getTitle(row.attack, row.metadata))}
      checked={selectedRowIds.has(row.savedObjectId)}
      data-test-subj={`${ATTACK_TAB_ROW_SELECT_TEST_ID}-${row.savedObjectId}`}
      id={`${ATTACK_TAB_ROW_SELECT_TEST_ID}-${row.savedObjectId}`}
      onChange={() => toggleRowSelected(row.savedObjectId)}
    />
  );
};

SelectAttackCell.displayName = 'SelectAttackCell';

const AttackActionsHeaderCell = () => <>{COLUMN_HEADERS[ATTACK_TAB_COLUMN_ID.actions]}</>;

AttackActionsHeaderCell.displayName = 'AttackActionsHeaderCell';

/**
 * The row's overflow, carrying the same menu the attack flyout's "Take action" button opens,
 * minus the navigation item the row already offers as its own icon button.
 */
const AttackMoreActionsButton = ({ row }: { row: AttackRow }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((isOpen) => !isOpen), []);

  const { attack, savedObjectId } = row;

  const isRemoteDocument = useMemo(() => isNonLocalIndexName(attack?.index ?? ''), [attack?.index]);

  // The menu reads the live document — its alert ids, tags, assignees and workflow status — so a
  // row that resolved to nothing but its snapshot has nothing to take action on.
  const isDisabled = attack == null;

  const button = (
    <EuiToolTip content={isDisabled ? UNRESOLVED_TOOLTIP : MORE_ACTIONS_LABEL} position="top">
      <EuiButtonIcon
        aria-label={MORE_ACTIONS_LABEL}
        color="text"
        data-test-subj={`${ATTACK_TAB_ROW_MORE_ACTIONS_TEST_ID}-${savedObjectId}`}
        iconType="boxesVertical"
        id={`${savedObjectId}-attack-more-actions`}
        isDisabled={isDisabled}
        onClick={togglePopover}
      />
    </EuiToolTip>
  );

  if (attack == null) {
    return button;
  }
  return (
    <EuiPopover
      anchorPosition="downLeft"
      aria-label={MORE_ACTIONS_LABEL}
      button={button}
      closePopover={closePopover}
      id={`${savedObjectId}-attack-more-actions-popover`}
      isOpen={isPopoverOpen}
      panelPaddingSize="none"
      panelProps={{ 'data-test-subj': ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID }}
      repositionOnScroll
    >
      <AttacksGroupTakeActionItems
        attack={attack}
        closePopover={closePopover}
        isRemoteDocument={isRemoteDocument}
        showAiAssistantAction={false}
        showNavigationAction={false}
        telemetrySource={TELEMETRY_SOURCE}
      />
    </EuiPopover>
  );
};

AttackMoreActionsButton.displayName = 'AttackMoreActionsButton';

const AttackActionsCell = ({ rowIndex }: EuiDataGridCellValueElementProps) => {
  const { canInvestigateInTimeline, investigateAttackInTimeline, rows } =
    useAttackGridCellContext();

  const row = rows[rowIndex];

  if (row == null) {
    return null;
  }

  const attackTitle = getTitle(row.attack, row.metadata);

  return (
    <EuiFlexGroup
      alignItems="center"
      data-test-subj={ATTACK_TAB_COLUMN_ACTIONS_TEST_ID}
      gutterSize="xs"
      responsive={false}
    >
      <EuiFlexItem grow={false}>
        <ShowAttackButton
          id={row.savedObjectId}
          attackId={row.attachmentId}
          indexName={row.attack?.index ?? row.metadata.index}
          attackTitle={attackTitle}
          isDisabled={row.isUnresolved}
        />
      </EuiFlexItem>
      {canInvestigateInTimeline ? (
        <EuiFlexItem grow={false}>
          {/* Disabled rather than hidden for an unresolved attack, so the row keeps the shape
              every other row has and the tooltip can say why. */}
          <InvestigateAttackInTimelineButton
            id={row.savedObjectId}
            isDisabled={getAttackAlertIds(row.attack).length === 0}
            onClick={() => investigateAttackInTimeline(row.attack)}
          />
        </EuiFlexItem>
      ) : null}
      <EuiFlexItem grow={false}>
        <AttackMoreActionsButton row={row} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

AttackActionsCell.displayName = 'AttackActionsCell';

const AttackGridCell = ({ rowIndex, columnId, isDetails }: EuiDataGridCellValueElementProps) => {
  const { rows } = useAttackGridCellContext();

  const row = rows[rowIndex];

  return row != null ? <AttackCell row={row} columnId={columnId} isDetails={isDetails} /> : null;
};

AttackGridCell.displayName = 'AttackGridCell';

const LEADING_CONTROL_COLUMNS: EuiDataGridControlColumn[] = [
  {
    id: SELECTION_COLUMN_ID,
    width: SELECTION_COLUMN_WIDTH,
    headerCellRender: SelectAllAttacksHeaderCell,
    rowCellRender: SelectAttackCell,
  },
  {
    id: ATTACK_TAB_COLUMN_ID.actions,
    width: ACTIONS_COLUMN_WIDTH,
    headerCellRender: AttackActionsHeaderCell,
    rowCellRender: AttackActionsCell,
  },
];

/**
 * Renders the "Attacks" accordion body in the case Attachments tab.
 *
 * Filters the case's attack attachments by `searchTerm` in-memory against the persisted
 * metadata before handing the surviving ids to the live query, so a search that matches
 * nothing costs no request.
 */
export const AttackTabContent: React.FC<CommonAttachmentListViewProps> = ({
  caseData,
  searchTerm,
}) => {
  const attachments = useMemo<AttackCaseAttachmentRow[]>(
    () =>
      caseData.comments.flatMap((comment) =>
        isAttackAttachment(comment) && (!searchTerm || matchesSearchTerm(comment, searchTerm))
          ? [comment]
          : []
      ),
    [caseData.comments, searchTerm]
  );

  if (attachments.length === 0) {
    return (
      <EuiEmptyPrompt
        data-test-subj={ATTACK_TAB_EMPTY_TEST_ID}
        iconType="securitySignalDetected"
        iconColor="default"
        titleSize="xs"
        body={
          <p>
            {searchTerm ? (
              <FormattedMessage
                id="xpack.securitySolution.attackDiscovery.cases.tab.noResults"
                defaultMessage="No attacks match your search."
              />
            ) : (
              <FormattedMessage
                id="xpack.securitySolution.attackDiscovery.cases.tab.empty"
                defaultMessage="No attacks have been attached to this case yet."
              />
            )}
          </p>
        }
      />
    );
  }

  return <AttackTabTable attachments={attachments} searchTerm={searchTerm} />;
};

AttackTabContent.displayName = 'AttackTabContent';

/**
 * Deferred inner component — keeps the attacks search request from firing on cases with no
 * attack attachments.
 */
const AttackTabTable = ({
  attachments,
  searchTerm,
}: {
  attachments: AttackCaseAttachmentRow[];
  searchTerm: CommonAttachmentListViewProps['searchTerm'];
}) => {
  const { http, storage } = useKibana().services;
  const { isAssistantEnabled } = useAssistantAvailability();
  // Resolved once for the whole grid rather than per row — see the hook.
  const { canInvestigateInTimeline, investigateAttackInTimeline } =
    useInvestigateAttackInTimeline();

  // One `_find` request for every attached attack rather than one per row. Memoized because
  // the array is part of the react-query key.
  const attackIds = useMemo(
    () => attachments.map(({ attachmentId }) => attachmentId),
    [attachments]
  );

  const { data, isLoading, status } = useFindAttackDiscoveries({
    http,
    ids: attackIds,
    // Attacks attached by a teammate belong to the case regardless of who generated them.
    includeAllAuthors: true,
    // `_find` defaults to 10 per page, which would silently truncate the section.
    perPage: Math.max(attackIds.length, 1),
    // The hook has no separate `enabled` flag; this doubles as one.
    isAssistantEnabled,
  });

  const attacksById = useMemo(
    () =>
      (data?.data ?? []).reduce<Record<string, AttackDiscoveryAlert>>((acc, attack) => {
        acc[attack.id] = attack;
        return acc;
      }, {}),
    [data?.data]
  );

  // A row the query never returned still renders, from the snapshot metadata: the attachment
  // records what the analyst captured, so dropping it would hide evidence. `_find` also
  // filters by visibility, so a missing id is not necessarily a deletion.
  const hasSettled = !isLoading && status !== 'idle';

  const items = useMemo<AttackRow[]>(
    () =>
      attachments.map((attachment) => {
        const attack = attacksById[attachment.attachmentId];
        return {
          attachmentId: attachment.attachmentId,
          savedObjectId: attachment.id,
          metadata: attachment.metadata,
          createdAt: attachment.createdAt,
          attachedBy: getAttachedBy(attachment.createdBy),
          attack,
          isUnresolved: hasSettled && attack == null,
        };
      }),
    [attachments, attacksById, hasSettled]
  );

  const [sortingColumns, setSortingColumns] =
    useState<EuiDataGridColumnSortingConfig[]>(DEFAULT_SORTING);

  const sorting = useMemo<EuiDataGridSorting>(
    () => ({ columns: sortingColumns, onSort: setSortingColumns }),
    [sortingColumns]
  );

  const rows = useMemo(
    () => [...items].sort((a, b) => compareRows(a, b, sortingColumns)),
    [items, sortingColumns]
  );

  // Read once, on mount: the selection is only ever changed from this grid's own picker.
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() =>
    toVisibleAttackTabColumnIds(storage.get(ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY))
  );

  // Persisted per user rather than per case: which columns an analyst reads attacks by is a
  // property of how they work, not of the case they happen to have open.
  const onChangeVisibleColumns = useCallback(
    (nextVisibleColumns: string[]) => {
      storage.set(ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY, nextVisibleColumns);
      setVisibleColumns(nextVisibleColumns);
    },
    [storage]
  );

  const columnVisibility = useMemo(
    () => ({ visibleColumns, setVisibleColumns: onChangeVisibleColumns }),
    [onChangeVisibleColumns, visibleColumns]
  );

  // Keyed by saved object id, the same handle the row actions and the bulk removal use.
  const [selectedRowIds, setSelectedRowIds] = useState<ReadonlySet<string>>(NO_SELECTION);

  const clearSelection = useCallback(() => setSelectedRowIds(NO_SELECTION), []);

  // A row the search has filtered out must not stay part of a bulk action the user can no
  // longer see.
  useEffect(() => {
    clearSelection();
  }, [clearSelection, searchTerm]);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const onChangeItemsPerPage = useCallback(
    (nextPageSize: number) => {
      setPageSize(nextPageSize);
      setPageIndex(0);
      // Repaginating reshuffles which rows a user can see at once, so the selection they built
      // against the old layout no longer describes anything they are looking at.
      clearSelection();
    },
    [clearSelection]
  );

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
      pageSizeOptions: PAGE_SIZE_OPTIONS,
      onChangeItemsPerPage,
      onChangePage: setPageIndex,
    }),
    [onChangeItemsPerPage, pageIndex, pageSize]
  );

  const toggleRowSelected = useCallback((savedObjectId: string) => {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (!next.delete(savedObjectId)) {
        next.add(savedObjectId);
      }
      return next;
    });
  }, []);

  // Taken from the rows rather than the selection, so an attachment removed from the case while
  // selected cannot leave the header checkbox stuck or the bulk bar naming a row that is gone.
  const selectedRows = useMemo(
    () => rows.filter(({ savedObjectId }) => selectedRowIds.has(savedObjectId)),
    [rows, selectedRowIds]
  );

  const selectedRowCount = selectedRows.length;

  const areAllRowsSelected = rows.length > 0 && selectedRowCount === rows.length;

  const toggleAllRowsSelected = useCallback(() => {
    // Every filtered row, not just the page on screen: the user asked for "all", and the rows
    // the grid is paginating over are all in hand here.
    setSelectedRowIds(
      areAllRowsSelected ? NO_SELECTION : new Set(rows.map(({ savedObjectId }) => savedObjectId))
    );
  }, [areAllRowsSelected, rows]);

  const cellContext = useMemo<AttackGridCellContextValue>(
    () => ({
      areAllRowsSelected,
      canInvestigateInTimeline,
      investigateAttackInTimeline,
      rows,
      selectedRowCount,
      selectedRowIds,
      toggleAllRowsSelected,
      toggleRowSelected,
    }),
    [
      areAllRowsSelected,
      canInvestigateInTimeline,
      investigateAttackInTimeline,
      rows,
      selectedRowCount,
      selectedRowIds,
      toggleAllRowsSelected,
      toggleRowSelected,
    ]
  );

  const selectedAttacks = useMemo<SelectedAttack[]>(
    () =>
      selectedRows.map(({ attachmentId, attack, metadata }) => ({
        attackId: attachmentId,
        title: getTitle(attack, metadata),
        attack,
      })),
    [selectedRows]
  );

  const toolbarVisibility = useMemo<EuiDataGridToolBarVisibilityOptions>(
    () => ({
      ...TOOLBAR_VISIBILITY,
      additionalControls: {
        left: {
          append: (
            <AttackTabBulkActions
              onActionSuccess={clearSelection}
              selectedAttacks={selectedAttacks}
            />
          ),
        },
      },
    }),
    [clearSelection, selectedAttacks]
  );

  return (
    <EuiFlexItem
      data-test-subj={ATTACK_TAB_TABLE_TEST_ID}
      css={css`
        position: relative;
      `}
    >
      {isLoading ? <EuiProgress color="accent" position="absolute" size="xs" /> : null}
      <AttackGridCellContext.Provider value={cellContext}>
        <EuiDataGrid
          aria-label={TABLE_CAPTION}
          columns={GRID_COLUMNS}
          columnVisibility={columnVisibility}
          data-test-subj={ATTACK_TAB_GRID_TEST_ID}
          gridStyle={GRID_STYLE}
          leadingControlColumns={LEADING_CONTROL_COLUMNS}
          pagination={pagination}
          renderCellValue={AttackGridCell}
          rowCount={rows.length}
          sorting={sorting}
          toolbarVisibility={toolbarVisibility}
        />
      </AttackGridCellContext.Provider>
    </EuiFlexItem>
  );
};

AttackTabTable.displayName = 'AttackTabTable';

/**
 * Renders one grid cell. Every value prefers the live attack document and falls back to the
 * snapshot persisted on the attachment, so a row is never blank because a field arrived in a
 * later release.
 *
 * Cell text is coloured with `EuiTextColor` rather than wrapped in `EuiText`, which would
 * override the font size and line height the grid sets from `gridStyle` and leave the rows
 * taller and tighter than the alerts grid's.
 */
const AttackCell = ({
  row,
  columnId,
  isDetails,
}: {
  row: AttackRow;
  columnId: string;
  isDetails: boolean;
}) => {
  const { attack, metadata, isUnresolved } = row;

  const testSubj = CELL_TEST_IDS[columnId as AttackTabColumnId];
  const color = isUnresolved ? 'subdued' : 'default';

  switch (columnId) {
    case ATTACK_TAB_COLUMN_ID.detectedOn: {
      const detectedOn = getDetectedOn(attack, metadata);
      return (
        <EuiTextColor color={color} data-test-subj={testSubj}>
          {detectedOn != null ? (
            <FormattedDate fieldName={DETECTED_ON_FIELD_NAME} value={detectedOn} />
          ) : (
            getEmptyValue()
          )}
        </EuiTextColor>
      );
    }

    case ATTACK_TAB_COLUMN_ID.title: {
      const title = getTitle(attack, metadata);

      // Degrades to plain text when the attack could not be resolved, the way the alerts grid's
      // rule cell does when there is no rule to open.
      return isUnresolved ? (
        <EuiToolTip content={UNRESOLVED_TOOLTIP}>
          {/* Focusable so the explanation is reachable by keyboard: the title is not a link here. */}
          <EuiTextColor
            color={color}
            data-test-subj={ATTACK_TAB_ROW_UNRESOLVED_TEST_ID}
            tabIndex={0}
          >
            <TruncatableText dataTestSubj={testSubj}>
              <span data-test-subj={ATTACK_TAB_ROW_TITLE_TEST_ID}>{title}</span>
            </TruncatableText>
          </EuiTextColor>
        </EuiToolTip>
      ) : (
        <AttackTitleLink
          attackId={row.attachmentId}
          indexName={attack?.index ?? metadata.index}
          title={title}
        />
      );
    }

    case ATTACK_TAB_COLUMN_ID.alerts: {
      const alertCount = getAlertCount(attack, metadata);
      return (
        <EuiTextColor color={color} data-test-subj={testSubj}>
          {alertCount ?? getEmptyValue()}
        </EuiTextColor>
      );
    }

    case ATTACK_TAB_COLUMN_ID.summary: {
      const summary = getSummary(attack, metadata);
      return (
        <EuiTextColor
          color={color}
          component="div"
          css={isDetails ? undefined : truncateCss}
          data-test-subj={testSubj}
        >
          {summary ?? getEmptyValue()}
        </EuiTextColor>
      );
    }

    case ATTACK_TAB_COLUMN_ID.riskScore: {
      const riskScore = getRiskScore(attack, metadata);
      return (
        <EuiTextColor color={color} data-test-subj={testSubj}>
          {riskScore ?? getEmptyValue()}
        </EuiTextColor>
      );
    }

    case ATTACK_TAB_COLUMN_ID.status:
      return (
        <EuiTextColor color={color} data-test-subj={testSubj}>
          <span data-test-subj={ATTACK_TAB_ROW_STATUS_TEST_ID}>
            {attack?.alertWorkflowStatus != null ? (
              <RuleStatus value={attack.alertWorkflowStatus} />
            ) : (
              getEmptyValue()
            )}
          </span>
        </EuiTextColor>
      );

    case ATTACK_TAB_COLUMN_ID.attachedBy:
      return (
        <EuiTextColor color={color} data-test-subj={testSubj}>
          {row.attachedBy}
        </EuiTextColor>
      );

    case ATTACK_TAB_COLUMN_ID.attachedAt:
      return (
        <EuiTextColor color={color} data-test-subj={testSubj}>
          <FormattedDate fieldName={ATTACHED_AT_FIELD_NAME} value={row.createdAt} />
        </EuiTextColor>
      );

    default:
      return null;
  }
};

AttackCell.displayName = 'AttackCell';

// eslint-disable-next-line import/no-default-export
export default AttackTabContent;
