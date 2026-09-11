/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import userEvent from '@testing-library/user-event';
import type { CommonAttachmentListViewProps } from '@kbn/cases-plugin/public';
import { SECURITY_ATTACK_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { AttackTabContent } from './attack_tab_content';
import {
  ATTACK_TAB_BULK_ACTIONS_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID,
  ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID,
  ATTACK_TAB_COLUMN_ACTIONS_TEST_ID,
  ATTACK_TAB_COLUMN_ALERTS_TEST_ID,
  ATTACK_TAB_COLUMN_ATTACHED_AT_TEST_ID,
  ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID,
  ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID,
  ATTACK_TAB_COLUMN_RISK_SCORE_TEST_ID,
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
  INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID,
  REMOVE_ATTACK_MODAL_TEST_ID,
  SHOW_ATTACK_BUTTON_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { TestProviders } from '../../../../common/mock/test_providers';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';
import { allCasesPermissions } from '../../../../cases_test_utils';
import { useFindAttackDiscoveries } from '../../../../attack_discovery/pages/use_find_attack_discoveries';
import { useAssistantAvailability } from '../../../../assistant/use_assistant_availability';
import { useInvestigateAttackInTimeline } from '../hooks/use_investigate_attack_in_timeline';
import { EXPLORE_IN_ATTACKS_TEST_ID } from '../../../../detections/hooks/attacks/bulk_actions/context_menu_items/use_attack_explore_in_attacks_context_menu_items';
import { STATUS_BUTTON_TEST_ID } from '../../../../flyout_v2/document/main/components/test_ids';
import {
  ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY,
  ATTACK_TAB_COLUMN_ID,
  PICKABLE_ATTACK_TAB_COLUMN_IDS,
} from '../utils';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../attack_discovery/pages/use_find_attack_discoveries');
jest.mock('../../../../assistant/use_assistant_availability');
jest.mock('../hooks/use_investigate_attack_in_timeline');
jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: () => ({ openFlyout: jest.fn() }),
}));
const mockOpenAttackFlyout = jest.fn();
jest.mock('../../../../flyout_v2/use_flyout_api', () => ({
  useFlyoutApi: () => ({ openAttackFlyout: mockOpenAttackFlyout }),
}));
jest.mock('../../../../common/hooks/use_is_new_flyout_enabled', () => ({
  useIsNewFlyoutEnabled: () => true,
}));

/** EUI's own handles on the data grid controls, which have no constant of ours to come from. */
const EUI_COLUMN_SELECTOR_TEST_ID = 'dataGridColumnSelectorButton';
const EUI_COLUMN_SORTING_TEST_ID = 'dataGridColumnSortingButton';
const EUI_DISPLAY_SELECTOR_TEST_ID = 'dataGridDisplaySelectorButton';
const EUI_FULL_SCREEN_TEST_ID = 'dataGridFullScreenButton';
const EUI_PAGINATION_TEST_ID = 'tablePaginationPopoverButton';
const EUI_TEN_ROWS_PER_PAGE_TEST_ID = 'tablePagination-10-rows';
const EUI_CELL_EXPAND_TEST_ID = 'euiDataGridCellExpandButton';
const EUI_CELL_EXPANSION_POPOVER_TEST_ID = 'euiDataGridExpansionPopover';
const euiHeaderActionsTestId = (columnId: string) => `dataGridHeaderCellActionButton-${columnId}`;
const euiPaginationButtonTestId = (pageNumber: number) => `pagination-button-${pageNumber - 1}`;
const euiColumnToggleTestId = (columnId: string) =>
  `dataGridColumnSelectorToggleColumnVisibility-${columnId}`;

// Every interaction here goes through the data grid, whose DOM is large enough that user-event's
// default per-event delay and pointer-events restyling dominate the runtime of these tests.
let user: UserEvent;

const useFindAttackDiscoveriesMock = useFindAttackDiscoveries as jest.Mock;
const useAssistantAvailabilityMock = useAssistantAvailability as jest.Mock;
const useInvestigateAttackInTimelineMock = useInvestigateAttackInTimeline as jest.Mock;
const mockedUseKibana = mockUseKibana();
const investigateAttackInTimeline = jest.fn();

const buildAttachment = (overrides: Record<string, unknown> = {}) => ({
  id: 'so-1',
  type: SECURITY_ATTACK_ATTACHMENT_TYPE,
  attachmentId: 'attack-id-1',
  createdAt: '2024-05-02T10:00:00.000Z',
  createdBy: { fullName: 'Ada Lovelace', username: 'ada', email: null },
  metadata: {
    title: 'Snapshotted attack title',
    summaryMarkdown: 'An adversary dumped {{ process.name lsass.exe }} memory',
    riskScore: 42,
    alertCount: 4,
    entityCount: 2,
    timestamp: '2024-04-01T09:00:00.000Z',
    index: '.alerts-security.attack.discovery.alerts-default',
  },
  ...overrides,
});

const buildCaseData = (comments: unknown[]) =>
  ({
    id: 'case-1',
    owner: 'securitySolution',
    comments,
  } as CommonAttachmentListViewProps['caseData']);

const liveAttack = {
  id: 'attack-id-1',
  title: 'Live attack title',
  summaryMarkdown: 'The adversary escalated on {{ host.name win-01 }}',
  detailsMarkdown: 'The adversary escalated privileges',
  entitySummaryMarkdown: '{{ host.name win-01 }}',
  mitreAttackTactics: ['Privilege Escalation'],
  riskScore: 77,
  alertIds: ['a', 'b', 'c'],
  alertWorkflowStatus: 'acknowledged',
  timestamp: '2024-05-01T08:30:00.000Z',
  index: '.alerts-security.attack.discovery.alerts-default',
  replacements: {},
};

const mockFindResult = (attacks: unknown[], overrides: Record<string, unknown> = {}) => {
  useFindAttackDiscoveriesMock.mockReturnValue({
    data: { data: attacks, page: 1, per_page: 10, total: attacks.length, connector_names: [] },
    isLoading: false,
    status: 'success',
    error: undefined,
    cancelRequest: jest.fn(),
    refetch: jest.fn(),
    ...overrides,
  });
};

const renderTab = (props?: Partial<CommonAttachmentListViewProps>) =>
  render(
    <TestProviders>
      <AttackTabContent caseData={buildCaseData([buildAttachment()])} {...props} />
    </TestProviders>
  );

const renderAttachments = (comments: unknown[]) =>
  render(
    <TestProviders>
      <AttackTabContent caseData={buildCaseData(comments)} />
    </TestProviders>
  );

const cellTexts = (testId: string) => screen.getAllByTestId(testId).map((cell) => cell.textContent);

/** Every row action is keyed by the attachment saved object id, not the attack document id. */
const showAttackButton = (savedObjectId: string) =>
  screen.getByTestId(`${SHOW_ATTACK_BUTTON_TEST_ID}-${savedObjectId}`);

const investigateInTimelineButton = (savedObjectId: string) =>
  screen.getByTestId(`${INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID}-${savedObjectId}`);

const moreActionsButton = (savedObjectId: string) =>
  screen.getByTestId(`${ATTACK_TAB_ROW_MORE_ACTIONS_TEST_ID}-${savedObjectId}`);

const moreActionsMenu = () => screen.getByTestId(ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID);

/** The grid cell wrapping a rendered cell body, which is where the grid puts column order. */
const gridCellOf = (testId: string): HTMLElement => {
  const cell = screen.getByTestId(testId).closest('[role="gridcell"]');

  if (!(cell instanceof HTMLElement)) {
    throw new Error(`No grid cell wraps ${testId}`);
  }

  return cell;
};

/** Sorts the grid through the column header's own actions, as a user would. */
const sortColumn = async (columnId: string, label: string) => {
  await user.click(screen.getByTestId(euiHeaderActionsTestId(columnId)));
  await user.click(await screen.findByText(label));
};

describe('AttackTabContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // A fresh instance per test, so keyboard focus left by one test cannot reach the next.
    user = userEvent.setup({ delay: null, pointerEventsCheck: 0 });
    // The grid persists its visible columns, so a selection left behind by one test would
    // decide what the next one renders.
    mockedUseKibana.services.storage.clear();
    useAssistantAvailabilityMock.mockReturnValue({ isAssistantEnabled: true });
    mockFindResult([liveAttack]);
    mockedUseKibana.services.cases.helpers.canUseCases = jest
      .fn()
      .mockReturnValue(allCasesPermissions());
    useInvestigateAttackInTimelineMock.mockReturnValue({
      canInvestigateInTimeline: true,
      investigateAttackInTimeline,
    });
  });

  it('renders an empty state and fires no query when no attacks are attached', () => {
    renderAttachments([]);

    expect(screen.getByTestId(ATTACK_TAB_EMPTY_TEST_ID)).toHaveTextContent(
      'No attacks have been attached to this case yet.'
    );
    expect(screen.queryByTestId(ATTACK_TAB_TABLE_TEST_ID)).not.toBeInTheDocument();
    expect(useFindAttackDiscoveriesMock).not.toHaveBeenCalled();
  });

  it('renders an empty state when the search term matches no attachment', () => {
    renderTab({ searchTerm: 'kerberoasting' });

    expect(screen.getByTestId(ATTACK_TAB_EMPTY_TEST_ID)).toHaveTextContent(
      'No attacks match your search.'
    );
    expect(useFindAttackDiscoveriesMock).not.toHaveBeenCalled();
  });

  it('keeps attachments matching the search term', () => {
    renderTab({ searchTerm: 'snapshotted' });

    expect(screen.getByTestId(ATTACK_TAB_GRID_TEST_ID)).toBeInTheDocument();
  });

  it('queries every attached attack id in a single request', () => {
    renderAttachments([
      buildAttachment(),
      buildAttachment({ id: 'so-2', attachmentId: 'attack-id-2' }),
    ]);

    expect(useFindAttackDiscoveriesMock).toHaveBeenCalledTimes(1);
    expect(useFindAttackDiscoveriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ['attack-id-1', 'attack-id-2'],
        includeAllAuthors: true,
        isAssistantEnabled: true,
        perPage: 2,
      })
    );
  });

  it('ignores attachments of other types', () => {
    renderAttachments([buildAttachment({ type: 'security.alert' })]);

    expect(screen.getByTestId(ATTACK_TAB_EMPTY_TEST_ID)).toBeInTheDocument();
  });

  describe('the grid', () => {
    it('renders the default columns from the live attack document', () => {
      renderTab();

      expect(screen.getByTestId(ATTACK_TAB_GRID_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID)).toHaveTextContent(
        'May 1, 2024 @ 08:30:00.000'
      );
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_TITLE_TEST_ID)).toHaveTextContent(
        'Live attack title'
      );
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ALERTS_TEST_ID)).toHaveTextContent('3');
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_SUMMARY_TEST_ID)).toHaveTextContent(
        'The adversary escalated on win-01'
      );
    });

    it('renders the detection time rather than the time the attack was attached', () => {
      renderTab();

      // `createdAt` is May 2nd; the attack was detected on May 1st.
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID)).not.toHaveTextContent(
        'May 2, 2024'
      );
    });

    it('falls back to the snapshotted detection time when the live document has none', () => {
      mockFindResult([]);

      renderTab();

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID)).toHaveTextContent(
        'Apr 1, 2024 @ 09:00:00.000'
      );
    });

    it('renders the empty value when neither the document nor the snapshot has a detection time', () => {
      mockFindResult([]);

      renderAttachments([
        buildAttachment({
          metadata: {
            title: 'Attached before timestamps were captured',
            alertCount: 1,
            index: '.alerts-security.attack.discovery.alerts-default',
          },
        }),
      ]);

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID)).toHaveTextContent('—');
    });

    it('hides the risk score, status and provenance columns until they are picked', () => {
      renderTab();

      expect(screen.queryByTestId(ATTACK_TAB_COLUMN_RISK_SCORE_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_TAB_ROW_STATUS_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_TAB_COLUMN_ATTACHED_AT_TEST_ID)).not.toBeInTheDocument();
    });

    it('offers a column selector and a sort selector, and no full screen or display controls', () => {
      renderTab();

      expect(screen.getByTestId(EUI_COLUMN_SELECTOR_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(EUI_COLUMN_SORTING_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(EUI_FULL_SCREEN_TEST_ID)).not.toBeInTheDocument();
      expect(screen.queryByTestId(EUI_DISPLAY_SELECTOR_TEST_ID)).not.toBeInTheDocument();
    });

    it('renders a hidden column, and its Unknown attaching user, once it is picked', async () => {
      renderAttachments([
        buildAttachment({ createdBy: { fullName: null, username: null, email: null } }),
      ]);

      await user.click(screen.getByTestId(EUI_COLUMN_SELECTOR_TEST_ID));
      await user.click(
        await screen.findByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.attachedBy))
      );

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID)).toHaveTextContent(
        'Unknown'
      );
    });

    it('paginates 50 rows at a time', () => {
      // The grid only renders its pagination bar once there are more rows than the smallest
      // page size option.
      renderAttachments(
        Array.from({ length: 12 }, (_, index) =>
          buildAttachment({ id: `so-${index}`, attachmentId: `attack-id-${index}` })
        )
      );

      expect(screen.getByTestId(EUI_PAGINATION_TEST_ID)).toHaveTextContent('Rows per page: 50');
    });
  });

  describe('the column picker', () => {
    const openColumnPicker = async () => {
      await user.click(screen.getByTestId(EUI_COLUMN_SELECTOR_TEST_ID));
    };

    /** Opens the picker once, then toggles each column, as a user works the popover. */
    const pickColumns = async (...columnIds: string[]) => {
      await openColumnPicker();

      for (const columnId of columnIds) {
        await user.click(await screen.findByTestId(euiColumnToggleTestId(columnId)));
      }
    };

    const { storage } = mockedUseKibana.services;

    const persistedColumnIds = () => storage.get(ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY);

    it('lists every pickable column, with only the defaults switched on', async () => {
      renderTab();

      await openColumnPicker();

      expect(
        await screen.findByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.detectedOn))
      ).toBeChecked();
      // Nothing the picker offers is missing from the pickable set the persisted selection is
      // narrowed against, which would leave that column unable to be remembered.
      expect(screen.getAllByTestId(/^dataGridColumnSelectorColumnItem-/)).toHaveLength(
        PICKABLE_ATTACK_TAB_COLUMN_IDS.length
      );
      expect(screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.title))).toBeChecked();
      expect(screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.alerts))).toBeChecked();
      expect(screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.summary))).toBeChecked();
      expect(
        screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.riskScore))
      ).not.toBeChecked();
      expect(
        screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.status))
      ).not.toBeChecked();
      expect(
        screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.attachedBy))
      ).not.toBeChecked();
      expect(
        screen.getByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.attachedAt))
      ).not.toBeChecked();
    });

    it('keeps the actions column out of the picker, as the grid always renders it', async () => {
      renderTab();

      await openColumnPicker();

      expect(await screen.findByTestId(EUI_COLUMN_SELECTOR_TEST_ID)).toBeInTheDocument();
      expect(
        screen.queryByTestId(euiColumnToggleTestId(ATTACK_TAB_COLUMN_ID.actions))
      ).not.toBeInTheDocument();
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ACTIONS_TEST_ID)).toBeInTheDocument();
    });

    it('renders the risk score once it is picked', async () => {
      renderTab();

      await pickColumns(ATTACK_TAB_COLUMN_ID.riskScore);

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_RISK_SCORE_TEST_ID)).toHaveTextContent('77');
    });

    it('renders the status as a rule status badge once it is picked', async () => {
      renderTab();

      await pickColumns(ATTACK_TAB_COLUMN_ID.status);

      expect(screen.getByTestId(ATTACK_TAB_ROW_STATUS_TEST_ID)).toHaveTextContent('acknowledged');
      expect(screen.getByTestId(STATUS_BUTTON_TEST_ID)).toBeInTheDocument();
    });

    it('renders the attaching user once it is picked', async () => {
      renderTab();

      await pickColumns(ATTACK_TAB_COLUMN_ID.attachedBy);

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID)).toHaveTextContent(
        'Ada Lovelace'
      );
    });

    it('renders the attachment time as a preference-formatted date once it is picked', async () => {
      renderTab();

      await pickColumns(ATTACK_TAB_COLUMN_ID.attachedAt);

      // `createdAt`, which is the day after the attack itself was detected.
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ATTACHED_AT_TEST_ID)).toHaveTextContent(
        'May 2, 2024 @ 10:00:00.000'
      );
    });

    it('takes a default column back off the grid', async () => {
      renderTab();

      await pickColumns(ATTACK_TAB_COLUMN_ID.alerts);

      expect(screen.queryByTestId(ATTACK_TAB_COLUMN_ALERTS_TEST_ID)).not.toBeInTheDocument();
    });

    it('remembers the selection across a remount', async () => {
      const { unmount } = renderTab();

      await pickColumns(ATTACK_TAB_COLUMN_ID.riskScore, ATTACK_TAB_COLUMN_ID.attachedBy);
      unmount();

      renderTab();

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_RISK_SCORE_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID)).toBeInTheDocument();
    });

    it('persists the selection under the attacks case attachment key alone', async () => {
      // The entities section of this same tab, which persists its own columns.
      const otherTableKey = 'securitySolution.entityAnalytics.cases.attachment.columns';
      storage.set(otherTableKey, ['entityName']);

      renderTab();
      await pickColumns(ATTACK_TAB_COLUMN_ID.status);

      expect(persistedColumnIds()).toContain(ATTACK_TAB_COLUMN_ID.status);
      expect(storage.get(otherTableKey)).toEqual(['entityName']);
    });

    it.each([
      ['is absent', undefined],
      ['holds something other than a list of columns', { columns: ['attachedBy'] }],
      ['holds no column this release renders', ['entityCount']],
      ['is empty', []],
    ])('falls back to the default columns when the persisted selection %s', (_label, persisted) => {
      if (persisted !== undefined) {
        storage.set(ATTACK_CASE_ATTACHMENT_COLUMNS_LOCAL_STORAGE_KEY, persisted);
      }

      renderTab();

      expect(screen.getByTestId(ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_TITLE_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ALERTS_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_SUMMARY_TEST_ID)).toBeInTheDocument();
      expect(screen.queryByTestId(ATTACK_TAB_COLUMN_ATTACHED_BY_TEST_ID)).not.toBeInTheDocument();
    });
  });

  describe('the summary column', () => {
    const summaryCell = () => screen.getByTestId(ATTACK_TAB_COLUMN_SUMMARY_TEST_ID);

    it('prefers the live summary, de-anonymised', () => {
      mockFindResult([
        {
          ...liveAttack,
          summaryMarkdown: 'The adversary escalated on {{ host.name ea25b45c }}',
          replacements: { ea25b45c: 'win-01' },
        },
      ]);

      renderTab();

      expect(summaryCell()).toHaveTextContent('The adversary escalated on win-01');
    });

    it('renders the snapshotted summary when the live document cannot be resolved', () => {
      mockFindResult([]);

      renderTab();

      expect(summaryCell()).toHaveTextContent('An adversary dumped lsass.exe memory');
    });

    it('renders plain text with no markdown field syntax', () => {
      mockFindResult([]);

      renderTab();

      expect(summaryCell().textContent).not.toContain('{{');
      expect(summaryCell().textContent).not.toContain('}}');
    });

    it('does not de-anonymise the snapshotted summary a second time', () => {
      // The snapshot was de-anonymised at attach time, so it holds original values. A word of it
      // that also happens to be a replacement key must survive verbatim.
      mockFindResult([{ ...liveAttack, summaryMarkdown: '', replacements: { admin: 'root' } }]);

      renderAttachments([
        buildAttachment({
          metadata: {
            title: 'Snapshotted attack title',
            summaryMarkdown: 'admin escalated privileges',
            alertCount: 1,
            timestamp: '2024-04-01T09:00:00.000Z',
            index: '.alerts-security.attack.discovery.alerts-default',
          },
        }),
      ]);

      expect(summaryCell()).toHaveTextContent('admin escalated privileges');
    });

    it('renders the empty value for an attachment written before summaries were captured', () => {
      mockFindResult([]);

      renderAttachments([
        buildAttachment({
          metadata: {
            title: 'Attached before summaries were captured',
            alertCount: 1,
            timestamp: '2024-04-01T09:00:00.000Z',
            index: '.alerts-security.attack.discovery.alerts-default',
          },
        }),
      ]);

      expect(summaryCell()).toHaveTextContent('—');
    });

    it('clips the summary to a single line', () => {
      renderTab();

      expect(summaryCell()).toHaveStyleRule('overflow', 'hidden');
      expect(summaryCell()).toHaveStyleRule('text-overflow', 'ellipsis');
      expect(summaryCell()).toHaveStyleRule('white-space', 'nowrap');
    });

    it('reveals the untruncated summary through the cell expansion popover', async () => {
      const longSummary = `The adversary authenticated as {{ user.name svc-backup }} and then ${'moved laterally through the estate '.repeat(
        8
      )}before exfiltrating data.`;
      mockFindResult([{ ...liveAttack, summaryMarkdown: longSummary }]);

      renderTab();

      await user.hover(summaryCell());
      expect(await screen.findByTestId(EUI_CELL_EXPAND_TEST_ID)).toBeInTheDocument();

      // The popover is opened by keyboard rather than by clicking the button above: the grid
      // unmounts its hover actions as the pointer moves onto them, so a synthetic click lands on
      // a detached node. Enter on the focused cell is the same affordance, and proves it is
      // reachable without a pointer.
      gridCellOf(ATTACK_TAB_COLUMN_SUMMARY_TEST_ID).focus();
      await user.keyboard('{Enter}');

      const popover = await screen.findByTestId(EUI_CELL_EXPANSION_POPOVER_TEST_ID);
      const expanded = within(popover).getByTestId(ATTACK_TAB_COLUMN_SUMMARY_TEST_ID);
      expect(expanded).toHaveTextContent('before exfiltrating data.');
      expect(expanded).not.toHaveStyleRule('white-space', 'nowrap');
    });
  });

  describe('sorting', () => {
    const attachmentsByDetectionTime = [
      buildAttachment({
        id: 'so-oldest',
        attachmentId: 'attack-oldest',
        metadata: {
          title: 'Oldest',
          alertCount: 1,
          timestamp: '2024-01-01T00:00:00.000Z',
          index: '.alerts-security.attack.discovery.alerts-default',
        },
      }),
      buildAttachment({
        id: 'so-newest',
        attachmentId: 'attack-newest',
        metadata: {
          title: 'Newest',
          alertCount: 1,
          timestamp: '2024-03-01T00:00:00.000Z',
          index: '.alerts-security.attack.discovery.alerts-default',
        },
      }),
      buildAttachment({
        id: 'so-undated',
        attachmentId: 'attack-undated',
        metadata: {
          title: 'Undated',
          alertCount: 1,
          index: '.alerts-security.attack.discovery.alerts-default',
        },
      }),
    ];

    beforeEach(() => {
      mockFindResult([]);
    });

    it('sorts by the detection time, newest first, by default', () => {
      renderAttachments(attachmentsByDetectionTime);

      expect(cellTexts(ATTACK_TAB_COLUMN_TITLE_TEST_ID)).toEqual(['Newest', 'Oldest', 'Undated']);
    });

    it('keeps rows with no detection time last when sorted oldest first', async () => {
      renderAttachments(attachmentsByDetectionTime);

      await sortColumn('detectedOn', 'Sort A-Z');

      expect(cellTexts(ATTACK_TAB_COLUMN_TITLE_TEST_ID)).toEqual(['Oldest', 'Newest', 'Undated']);
    });
  });

  describe('the title column', () => {
    const titleCell = () => screen.getByTestId(ATTACK_TAB_COLUMN_TITLE_TEST_ID);

    it('renders the title as a link, like the rule cell of the alerts grid', () => {
      renderTab();

      expect(titleCell().tagName).toBe('BUTTON');
      expect(titleCell()).toHaveClass('euiLink');
    });

    it('opens the attack flyout when the title is clicked', async () => {
      renderTab();

      await user.click(titleCell());

      expect(mockOpenAttackFlyout).toHaveBeenCalledWith(
        expect.objectContaining({
          attackId: 'attack-id-1',
          attackTitle: 'Live attack title',
        })
      );
    });

    it('renders plain text rather than a link when the attack cannot be resolved', async () => {
      mockFindResult([]);

      renderTab();

      expect(titleCell().tagName).not.toBe('BUTTON');

      await user.click(titleCell());

      expect(mockOpenAttackFlyout).not.toHaveBeenCalled();
    });
  });

  describe('unresolved attacks', () => {
    it('falls back to the snapshotted metadata and disables navigation', () => {
      mockFindResult([]);

      renderTab();

      expect(screen.getByTestId(ATTACK_TAB_ROW_TITLE_TEST_ID)).toHaveTextContent(
        'Snapshotted attack title'
      );
      expect(screen.getByTestId(ATTACK_TAB_COLUMN_ALERTS_TEST_ID)).toHaveTextContent('4');
      expect(showAttackButton('so-1')).toBeDisabled();
    });

    it('explains itself through a tooltip reachable by keyboard', () => {
      mockFindResult([]);

      renderTab();

      expect(screen.getByTestId(ATTACK_TAB_ROW_UNRESOLVED_TEST_ID)).toHaveAttribute(
        'tabindex',
        '0'
      );
    });

    it('keeps an unresolved row alongside a resolved one', () => {
      mockFindResult([liveAttack]);

      renderAttachments([
        buildAttachment(),
        buildAttachment({
          id: 'so-2',
          attachmentId: 'attack-id-2',
          metadata: {
            title: 'Deleted attack',
            alertCount: 1,
            timestamp: '2024-04-30T09:00:00.000Z',
            index: '.alerts-security.attack.discovery.alerts-default',
          },
        }),
      ]);

      expect(screen.getAllByTestId(ATTACK_TAB_ROW_TITLE_TEST_ID)).toHaveLength(2);
      expect(showAttackButton('so-1')).toBeEnabled();
      expect(showAttackButton('so-2')).toBeDisabled();
    });

    it('does not mark rows unresolved while the query is still loading', () => {
      mockFindResult([], { isLoading: true, status: 'loading', data: undefined });

      renderTab();

      expect(screen.queryByTestId(ATTACK_TAB_ROW_UNRESOLVED_TEST_ID)).not.toBeInTheDocument();
      expect(showAttackButton('so-1')).toBeEnabled();
    });
  });

  describe('the row actions control column', () => {
    it('renders every action on every row', () => {
      renderAttachments([
        buildAttachment(),
        buildAttachment({ id: 'so-2', attachmentId: 'attack-id-2' }),
      ]);

      expect(screen.getAllByTestId(ATTACK_TAB_COLUMN_ACTIONS_TEST_ID)).toHaveLength(2);
      expect(showAttackButton('so-1')).toBeInTheDocument();
      expect(investigateInTimelineButton('so-1')).toBeInTheDocument();
      expect(moreActionsButton('so-1')).toBeInTheDocument();
      expect(showAttackButton('so-2')).toBeInTheDocument();
      expect(investigateInTimelineButton('so-2')).toBeInTheDocument();
      expect(moreActionsButton('so-2')).toBeInTheDocument();
    });

    it('carries exactly three controls, in the order the alerts grid uses', () => {
      renderTab();

      const buttons = Array.from(
        screen.getByTestId(ATTACK_TAB_COLUMN_ACTIONS_TEST_ID).querySelectorAll('button')
      );

      expect(buttons).toEqual([
        showAttackButton('so-1'),
        investigateInTimelineButton('so-1'),
        moreActionsButton('so-1'),
      ]);
    });

    it('renders the more actions control as an overflow icon button', () => {
      renderTab();

      expect(moreActionsButton('so-1')).toHaveAttribute('aria-label', 'More attack actions');
      expect(
        moreActionsButton('so-1').querySelector('[data-euiicon-type="boxesVertical"]')
      ).toBeInTheDocument();
    });

    it('leads the row, ahead of the first data column', () => {
      renderTab();

      const cells = Array.from(
        screen.getByTestId(ATTACK_TAB_GRID_TEST_ID).querySelectorAll('[role="gridcell"]')
      );

      expect(cells.indexOf(gridCellOf(ATTACK_TAB_COLUMN_ACTIONS_TEST_ID))).toBeLessThan(
        cells.indexOf(gridCellOf(ATTACK_TAB_COLUMN_DETECTED_ON_TEST_ID))
      );
    });

    it('exposes the show attack button on each row', () => {
      renderTab();

      expect(showAttackButton('so-1')).toBeEnabled();
    });

    it('keeps every action in the keyboard tab order', async () => {
      renderTab();

      showAttackButton('so-1').focus();
      expect(showAttackButton('so-1')).toHaveFocus();

      await user.tab();

      expect(investigateInTimelineButton('so-1')).toHaveFocus();

      await user.tab();

      expect(moreActionsButton('so-1')).toHaveFocus();
    });

    it('opens Timeline on the attack when the investigate action is used', async () => {
      renderTab();

      await user.click(investigateInTimelineButton('so-1'));

      expect(investigateAttackInTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'attack-id-1' })
      );
    });

    it('disables the investigate action for an attack that could not be resolved', () => {
      mockFindResult([]);

      renderTab();

      expect(investigateInTimelineButton('so-1')).toBeDisabled();
    });

    it('omits the investigate action from every row when the user cannot read timelines', () => {
      useInvestigateAttackInTimelineMock.mockReturnValue({
        canInvestigateInTimeline: false,
        investigateAttackInTimeline,
      });

      renderTab();

      expect(
        screen.queryByTestId(`${INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID}-so-1`)
      ).not.toBeInTheDocument();
      expect(showAttackButton('so-1')).toBeInTheDocument();
      expect(moreActionsButton('so-1')).toBeInTheDocument();
    });

    it('opens the attack flyout when the show action is activated by keyboard', async () => {
      renderTab();

      showAttackButton('so-1').focus();
      await user.keyboard('{Enter}');

      expect(mockOpenAttackFlyout).toHaveBeenCalledWith(
        expect.objectContaining({ attackId: 'attack-id-1' })
      );
    });

    it('offers no way to remove an attachment', async () => {
      renderTab();

      await user.click(moreActionsButton('so-1'));

      expect(screen.queryByText(/remove/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId(REMOVE_ATTACK_MODAL_TEST_ID)).not.toBeInTheDocument();
    });

    describe('the more actions menu', () => {
      it('opens the take action menu the flyout offers', async () => {
        renderTab();

        expect(
          screen.queryByTestId(ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID)
        ).not.toBeInTheDocument();

        await user.click(moreActionsButton('so-1'));

        expect(within(moreActionsMenu()).getByText('Add to existing case')).toBeInTheDocument();
        expect(within(moreActionsMenu()).getByText('Add to new case')).toBeInTheDocument();
      });

      it('opens by keyboard', async () => {
        renderTab();

        moreActionsButton('so-1').focus();
        await user.keyboard('{Enter}');

        expect(moreActionsMenu()).toBeInTheDocument();
      });

      it('omits the navigation item the row already offers as an icon button', async () => {
        renderTab();

        await user.click(moreActionsButton('so-1'));

        expect(
          within(moreActionsMenu()).queryByTestId(EXPLORE_IN_ATTACKS_TEST_ID)
        ).not.toBeInTheDocument();
        expect(within(moreActionsMenu()).queryByText('Explore in Attacks')).not.toBeInTheDocument();
        expect(
          within(moreActionsMenu()).queryByText('Investigate in Timeline')
        ).not.toBeInTheDocument();
      });

      it('omits the AI assistant item, as the flyout footer does', async () => {
        renderTab();

        await user.click(moreActionsButton('so-1'));

        expect(
          within(moreActionsMenu()).queryByTestId('viewInAiAssistant')
        ).not.toBeInTheDocument();
        expect(
          within(moreActionsMenu()).queryByTestId('viewInAgentBuilder')
        ).not.toBeInTheDocument();
      });

      it('closes when an item is selected', async () => {
        renderTab();

        await user.click(moreActionsButton('so-1'));
        await user.click(within(moreActionsMenu()).getByText('Add to existing case'));

        await waitFor(() =>
          expect(
            screen.queryByTestId(ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID)
          ).not.toBeInTheDocument()
        );
      });

      it('is disabled, and opens nothing, for an attack that could not be resolved', async () => {
        mockFindResult([]);

        renderTab();

        expect(moreActionsButton('so-1')).toBeDisabled();

        await user.click(moreActionsButton('so-1'));

        expect(
          screen.queryByTestId(ATTACK_TAB_ROW_MORE_ACTIONS_POPOVER_TEST_ID)
        ).not.toBeInTheDocument();
      });

      it('explains why it is disabled for an attack that could not be resolved', async () => {
        mockFindResult([]);

        renderTab();

        fireEvent.mouseOver(moreActionsButton('so-1'));

        expect(
          await screen.findByText(
            'This attack could not be loaded. It may have been deleted, aged into a frozen tier, or be outside your access. The details shown were captured when it was attached.'
          )
        ).toBeInTheDocument();
      });
    });
  });

  describe('the selection control column', () => {
    const selectAllCheckbox = () => screen.getByTestId(ATTACK_TAB_SELECT_ALL_TEST_ID);

    const rowCheckbox = (savedObjectId: string) =>
      screen.getByTestId(`${ATTACK_TAB_ROW_SELECT_TEST_ID}-${savedObjectId}`);

    const twoAttachments = () => [
      buildAttachment(),
      buildAttachment({ id: 'so-2', attachmentId: 'attack-id-2' }),
    ];

    /** Twelve unresolvable attachments, so every row sorts on the same snapshotted timestamp. */
    const renderTwelveAttachments = () => {
      mockFindResult([]);

      return renderAttachments(
        Array.from({ length: 12 }, (_, index) =>
          buildAttachment({ id: `so-${index}`, attachmentId: `attack-id-${index}` })
        )
      );
    };

    const showTenRowsPerPage = async () => {
      await user.click(screen.getByTestId(EUI_PAGINATION_TEST_ID));
      await user.click(await screen.findByTestId(EUI_TEN_ROWS_PER_PAGE_TEST_ID));
    };

    const goToPage = async (pageNumber: number) => {
      await user.click(screen.getByTestId(euiPaginationButtonTestId(pageNumber)));
    };

    it('leads the row, ahead of the actions column', () => {
      renderTab();

      const cells = Array.from(
        screen.getByTestId(ATTACK_TAB_GRID_TEST_ID).querySelectorAll('[role="gridcell"]')
      );

      expect(cells.indexOf(gridCellOf(`${ATTACK_TAB_ROW_SELECT_TEST_ID}-so-1`))).toBeLessThan(
        cells.indexOf(gridCellOf(ATTACK_TAB_COLUMN_ACTIONS_TEST_ID))
      );
    });

    it('labels every checkbox with the attack it selects', () => {
      renderAttachments(twoAttachments());

      expect(selectAllCheckbox()).toHaveAccessibleName('Select all attacks');
      expect(rowCheckbox('so-1')).toHaveAccessibleName('Select Live attack title');
      // Unresolved, so the checkbox names it from the snapshot rather than going unlabelled.
      expect(rowCheckbox('so-2')).toHaveAccessibleName('Select Snapshotted attack title');
    });

    it('selects and deselects a single row', async () => {
      renderTab();

      expect(rowCheckbox('so-1')).not.toBeChecked();

      await user.click(rowCheckbox('so-1'));
      expect(rowCheckbox('so-1')).toBeChecked();

      await user.click(rowCheckbox('so-1'));
      expect(rowCheckbox('so-1')).not.toBeChecked();
    });

    it('reflects a partial selection in the header checkbox', async () => {
      renderAttachments(twoAttachments());

      await user.click(rowCheckbox('so-1'));
      expect(selectAllCheckbox()).toBePartiallyChecked();

      await user.click(rowCheckbox('so-2'));
      expect(selectAllCheckbox()).toBeChecked();
    });

    it('selects every filtered row, including the ones on a later page', async () => {
      renderTwelveAttachments();
      await showTenRowsPerPage();

      await user.click(selectAllCheckbox());

      expect(rowCheckbox('so-0')).toBeChecked();

      await goToPage(2);

      expect(rowCheckbox('so-10')).toBeChecked();
      expect(rowCheckbox('so-11')).toBeChecked();
    });

    it('deselects every row when the header checkbox is cleared', async () => {
      renderAttachments(twoAttachments());

      await user.click(selectAllCheckbox());
      await user.click(selectAllCheckbox());

      expect(rowCheckbox('so-1')).not.toBeChecked();
      expect(rowCheckbox('so-2')).not.toBeChecked();
    });

    it('keeps the selection when navigating between pages', async () => {
      renderTwelveAttachments();
      await showTenRowsPerPage();

      await user.click(rowCheckbox('so-0'));
      await goToPage(2);
      await goToPage(1);

      expect(rowCheckbox('so-0')).toBeChecked();
    });

    it('clears the selection when the page size changes', async () => {
      renderTwelveAttachments();

      await user.click(rowCheckbox('so-0'));
      expect(rowCheckbox('so-0')).toBeChecked();

      await showTenRowsPerPage();

      expect(rowCheckbox('so-0')).not.toBeChecked();
    });

    it('clears the selection when the search term changes', async () => {
      const caseData = buildCaseData([buildAttachment()]);
      const { rerender } = render(
        <TestProviders>
          <AttackTabContent caseData={caseData} />
        </TestProviders>
      );

      await user.click(rowCheckbox('so-1'));
      expect(rowCheckbox('so-1')).toBeChecked();

      rerender(
        <TestProviders>
          <AttackTabContent caseData={caseData} searchTerm="snapshotted" />
        </TestProviders>
      );

      expect(rowCheckbox('so-1')).not.toBeChecked();
    });
  });

  describe('the bulk action bar', () => {
    const rowCheckbox = (savedObjectId: string) =>
      screen.getByTestId(`${ATTACK_TAB_ROW_SELECT_TEST_ID}-${savedObjectId}`);

    /** Sorted by detection time, `so-1` is the live attack and `so-2` the unresolved one. */
    const renderTwoAttachments = () =>
      renderAttachments([
        buildAttachment(),
        buildAttachment({ id: 'so-2', attachmentId: 'attack-id-2' }),
      ]);

    const bulkActionsMenu = () => screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_POPOVER_TEST_ID);

    const openBulkActionsMenu = async () => {
      await user.click(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID));
    };

    it('stays hidden until a row is selected', () => {
      renderTwoAttachments();

      expect(screen.queryByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).not.toBeInTheDocument();
    });

    it('appears with the selection, and counts it', async () => {
      renderTwoAttachments();

      await user.click(rowCheckbox('so-1'));
      expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).toHaveTextContent(
        '1 attack selected'
      );

      await user.click(rowCheckbox('so-2'));
      expect(screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).toHaveTextContent(
        '2 attacks selected'
      );
    });

    it('goes away again when the selection is cleared', async () => {
      renderTwoAttachments();

      await user.click(rowCheckbox('so-1'));
      await user.click(rowCheckbox('so-1'));

      expect(screen.queryByTestId(ATTACK_TAB_BULK_ACTIONS_TEST_ID)).not.toBeInTheDocument();
    });

    it('offers the attack take-action verbs across the selection', async () => {
      renderTwoAttachments();

      await user.click(rowCheckbox('so-1'));
      await openBulkActionsMenu();

      expect(within(bulkActionsMenu()).getByText('Add to existing case')).toBeInTheDocument();
      expect(within(bulkActionsMenu()).getByText('Add to new case')).toBeInTheDocument();
    });

    it('opens by keyboard', async () => {
      renderTwoAttachments();

      await user.click(rowCheckbox('so-1'));
      screen.getByTestId(ATTACK_TAB_BULK_ACTIONS_BUTTON_TEST_ID).focus();
      await user.keyboard('{Enter}');

      expect(bulkActionsMenu()).toBeInTheDocument();
    });

    it('offers no way to remove the selected attachments', async () => {
      renderTwoAttachments();

      await user.click(rowCheckbox('so-1'));
      await openBulkActionsMenu();

      expect(within(bulkActionsMenu()).queryByText(/remove/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId(REMOVE_ATTACK_MODAL_TEST_ID)).not.toBeInTheDocument();
    });
  });
});
