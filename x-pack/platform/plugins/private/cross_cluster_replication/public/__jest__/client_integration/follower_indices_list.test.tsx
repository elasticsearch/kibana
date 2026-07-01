/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, screen, within, act } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import './mocks';
import { getFollowerIndexMock } from './fixtures/follower_index';
import { setupEnvironment, pageHelpers, getRandomString } from './helpers';
import type { FollowerIndexListSetupResult } from './helpers/follower_index_list.helpers';
import { EuiTableTestHarness } from '@kbn/test-eui-helpers';
import type { FollowerIndex } from '../../../common/types';

const { setup } = pageHelpers.followerIndexList;

type SetupEnvironmentReturn = ReturnType<typeof setupEnvironment>;

describe('<FollowerIndicesList />', () => {
  let httpRequestsMockHelpers: SetupEnvironmentReturn['httpRequestsMockHelpers'];
  let httpSetup: SetupEnvironmentReturn['httpSetup'];
  let user: UserEvent;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    ({ httpRequestsMockHelpers, httpSetup } = setupEnvironment());
    httpRequestsMockHelpers.setLoadFollowerIndicesResponse();
  });

  describe('on component mount', () => {
    beforeEach(() => {
      // Override HTTP mocks to return never-resolving promises
      // This keeps the component in LOADING state without triggering act warnings
      httpSetup.get.mockImplementation(() => new Promise(() => {}));

      ({ user } = setup());
    });

    test('should show a loading indicator on component', () => {
      expect(screen.getByTestId('sectionLoading')).toBeInTheDocument();
    });
  });

  describe('when there are no follower indices', () => {
    beforeEach(async () => {
      ({ user } = setup());
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
    });

    test('should display an empty prompt', () => {
      expect(screen.getByTestId('emptyPrompt')).toBeInTheDocument();
    });

    test('should have a button to create a follower index', () => {
      expect(screen.getByTestId('createFollowerIndexButton')).toBeInTheDocument();
    });
  });

  describe('when there are multiple pages of follower indices', () => {
    const followerIndices: FollowerIndex[] = [getFollowerIndexMock({ name: 'unique' })];

    for (let i = 0; i < 29; i++) {
      followerIndices.push(getFollowerIndexMock({ name: `name${i}` }));
    }

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadFollowerIndicesResponse({ indices: followerIndices });
      ({ user } = setup());
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });
    });

    test('pagination works', async () => {
      const table = new EuiTableTestHarness('followerIndexListTable');
      const initialRows = table.getRows();
      expect(initialRows.length).toBe(20); // Default page size

      const nextButton = screen.getByLabelText('Next page');
      fireEvent.click(nextButton);

      const rowsAfterPagination = table.getRows();
      expect(rowsAfterPagination.length).toBe(10); // Remaining items on page 2
    });

    test('search works', async () => {
      const searchBox = screen.getByTestId('followerIndexSearch');
      fireEvent.change(searchBox, { target: { value: 'unique' } });
      fireEvent.blur(searchBox);

      const table = new EuiTableTestHarness('followerIndexListTable');
      const rows = table.getRows();
      expect(rows.length).toBe(1);
    });
  });

  describe('when there are follower indices', () => {
    let table: EuiTableTestHarness;
    let tableCellsValues: string[][];
    let actions: FollowerIndexListSetupResult['actions'];

    const index1 = getFollowerIndexMock({ name: `a${getRandomString()}` });
    const index2 = getFollowerIndexMock({ name: `b${getRandomString()}`, status: 'paused' });

    const followerIndices = [index1, index2];

    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadFollowerIndicesResponse({ indices: followerIndices });

      ({ user, actions } = setup());
      await act(async () => {
        await jest.runOnlyPendingTimersAsync();
      });

      table = new EuiTableTestHarness('followerIndexListTable');
      tableCellsValues = table.getCellValues();
    });

    test('should not display the empty prompt', () => {
      expect(screen.queryByTestId('emptyPrompt')).not.toBeInTheDocument();
    });

    test('should have a button to create a follower index', () => {
      expect(screen.getByTestId('createFollowerIndexButton')).toBeInTheDocument();
    });

    test('should list the follower indices in the table', () => {
      expect(tableCellsValues.length).toEqual(followerIndices.length);
      expect(tableCellsValues).toEqual([
        [
          '', // Checkbox column
          index1.name,
          'Active',
          index1.remoteCluster,
          index1.leaderIndex,
          '', // Actions column
        ],
        ['', index2.name, 'Paused', index2.remoteCluster, index2.leaderIndex, ''],
      ]);
    });

    describe('action menu', () => {
      test('should be visible when a follower index is selected', async () => {
        expect(screen.queryByTestId('contextMenuButton')).not.toBeInTheDocument();

        const firstCheckbox = within(table.getRows()[0]).getByRole('checkbox');
        await user.click(firstCheckbox);

        expect(await screen.findByTestId('contextMenuButton')).toBeInTheDocument();
      });

      test('should have a "pause", "edit" and "unfollow" action when the follower index is active', async () => {
        const firstCheckbox = within(table.getRows()[0]).getByRole('checkbox');
        await user.click(firstCheckbox);

        const contextMenuButton = await screen.findByTestId('contextMenuButton');
        await user.click(contextMenuButton);

        const contextMenu = await screen.findByTestId('contextMenu');
        const buttons = within(contextMenu).queryAllByRole('button');
        const buttonsLabel = buttons.map((btn: HTMLElement) => btn.textContent);

        expect(buttonsLabel).toEqual([
          'Pause replication',
          'Edit follower index',
          'Unfollow leader index',
        ]);
      });

      test('should have a "resume", "edit" and "unfollow" action when the follower index is paused', async () => {
        const secondCheckbox = within(table.getRows()[1]).getByRole('checkbox');
        await user.click(secondCheckbox);

        const contextMenuButton = await screen.findByTestId('contextMenuButton');
        await user.click(contextMenuButton);

        const contextMenu = await screen.findByTestId('contextMenu');
        const buttons = within(contextMenu).queryAllByRole('button');
        const buttonsLabel = buttons.map((btn: HTMLElement) => btn.textContent);

        expect(buttonsLabel).toEqual([
          'Resume replication',
          'Edit follower index',
          'Unfollow leader index',
        ]);
      });

      test('should open a confirmation modal when clicking on "pause replication"', async () => {
        expect(screen.queryByTestId('pauseReplicationConfirmation')).not.toBeInTheDocument();

        const firstCheckbox = within(table.getRows()[0]).getByRole('checkbox');
        await user.click(firstCheckbox);

        const contextMenuButton = await screen.findByTestId('contextMenuButton');
        await user.click(contextMenuButton);

        const contextMenu = await screen.findByTestId('contextMenu');
        const pauseButton = within(contextMenu).queryAllByRole('button')[0];
        await user.click(pauseButton);

        expect(await screen.findByTestId('pauseReplicationConfirmation')).toBeInTheDocument();
      });

      test('should open a confirmation modal when clicking on "unfollow leader index"', async () => {
        expect(screen.queryByTestId('unfollowLeaderConfirmation')).not.toBeInTheDocument();

        const firstCheckbox = within(table.getRows()[0]).getByRole('checkbox');
        await user.click(firstCheckbox);

        const contextMenuButton = await screen.findByTestId('contextMenuButton');
        await user.click(contextMenuButton);

        const contextMenu = await screen.findByTestId('contextMenu');
        const unfollowButton = within(contextMenu).queryAllByRole('button')[2];
        await user.click(unfollowButton);

        expect(await screen.findByTestId('unfollowLeaderConfirmation')).toBeInTheDocument();
      });

      test('should clear the selection after confirming an action', async () => {
        const firstCheckbox = within(table.getRows()[0]).getByRole('checkbox');
        await user.click(firstCheckbox);
        expect(firstCheckbox).toBeChecked();

        const contextMenuButton = await screen.findByTestId('contextMenuButton');
        await user.click(contextMenuButton);

        const contextMenu = await screen.findByTestId('contextMenu');
        const pauseButton = within(contextMenu).queryAllByRole('button')[0];
        await user.click(pauseButton);

        const confirmation = await screen.findByTestId('pauseReplicationConfirmation');
        const confirmButton = within(confirmation).getByTestId('confirmModalConfirmButton');
        await user.click(confirmButton);

        await act(async () => {
          await jest.runOnlyPendingTimersAsync();
        });

        // The selection is reset, so the manage button is gone and the row is unchecked.
        expect(screen.queryByTestId('contextMenuButton')).not.toBeInTheDocument();
        expect(within(table.getRows()[0]).getByRole('checkbox')).not.toBeChecked();
      });

      test('should clear the selection after confirming an action from the detail flyout', async () => {
        const firstCheckbox = within(table.getRows()[0]).getByRole('checkbox');
        await user.click(firstCheckbox);
        expect(firstCheckbox).toBeChecked();

        // Open the detail flyout for the selected follower index via its name link.
        await actions.clickFollowerIndexAt(0);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        const manageButton = within(detailPanel).getByTestId('manageButton');
        await user.click(manageButton);

        const contextMenu = await screen.findByTestId('contextMenu');
        const pauseButton = within(contextMenu).queryAllByRole('button')[0];
        await user.click(pauseButton);

        const confirmation = await screen.findByTestId('pauseReplicationConfirmation');
        const confirmButton = within(confirmation).getByTestId('confirmModalConfirmButton');
        await user.click(confirmButton);

        await act(async () => {
          await jest.runOnlyPendingTimersAsync();
        });

        // The selection is reset through the detail flyout too, so the bulk manage button
        // is gone and the row is unchecked.
        expect(screen.queryByTestId('contextMenuButton')).not.toBeInTheDocument();
        expect(within(table.getRows()[0]).getByRole('checkbox')).not.toBeChecked();
      });
    });

    describe('table row action menu', () => {
      test('should open a context menu when clicking on the button of each row', async () => {
        expect(document.querySelector('.euiContextMenuPanel')).toBeNull();

        const actionButton = within(table.getRows()[0]).getByTestId(
          'euiCollapsedItemActionsButton'
        );
        await user.click(actionButton);

        expect(document.querySelector('.euiContextMenuPanel')).not.toBeNull();
      });

      test('should have the "pause", "edit" and "unfollow" options in the row context menu', async () => {
        const actionButton = within(table.getRows()[0]).getByTestId(
          'euiCollapsedItemActionsButton'
        );
        await user.click(actionButton);

        const contextMenuPanel = document.querySelector('.euiContextMenuPanel');
        if (!contextMenuPanel) {
          throw new Error('expected row context menu panel');
        }
        const buttons = contextMenuPanel.querySelectorAll('button.euiContextMenuItem');
        const buttonLabels = Array.from(buttons).map((btn: Element) => btn.textContent);

        expect(buttonLabels).toEqual([
          'Pause replication',
          'Edit follower index',
          'Unfollow leader index',
        ]);
      });

      test('should have the "resume", "edit" and "unfollow" options in the row context menu for paused index', async () => {
        const actionButton = within(table.getRows()[1]).getByTestId(
          'euiCollapsedItemActionsButton'
        );
        await user.click(actionButton);

        const contextMenuPanel = document.querySelector('.euiContextMenuPanel');
        if (!contextMenuPanel) {
          throw new Error('expected row context menu panel');
        }
        const buttons = contextMenuPanel.querySelectorAll('button.euiContextMenuItem');
        const buttonLabels = Array.from(buttons).map((btn: Element) => btn.textContent);

        expect(buttonLabels).toEqual([
          'Resume replication',
          'Edit follower index',
          'Unfollow leader index',
        ]);
      });

      test('should open a confirmation modal when clicking on "pause replication"', async () => {
        expect(screen.queryByTestId('pauseReplicationConfirmation')).not.toBeInTheDocument();

        const actionButton = within(table.getRows()[0]).getByTestId(
          'euiCollapsedItemActionsButton'
        );
        await user.click(actionButton);

        const pauseButton = await screen.findByTestId('pauseButton');
        await user.click(pauseButton);

        expect(await screen.findByTestId('pauseReplicationConfirmation')).toBeInTheDocument();
      });

      test('should open a confirmation modal when clicking on "resume"', async () => {
        expect(screen.queryByTestId('resumeReplicationConfirmation')).not.toBeInTheDocument();

        const actionButton = within(table.getRows()[1]).getByTestId(
          'euiCollapsedItemActionsButton'
        );
        await user.click(actionButton);

        const resumeButton = await screen.findByTestId('resumeButton');
        await user.click(resumeButton);

        expect(await screen.findByTestId('resumeReplicationConfirmation')).toBeInTheDocument();
      });

      test('should open a confirmation modal when clicking on "unfollow leader index"', async () => {
        expect(screen.queryByTestId('unfollowLeaderConfirmation')).not.toBeInTheDocument();

        const actionButton = within(table.getRows()[0]).getByTestId(
          'euiCollapsedItemActionsButton'
        );
        await user.click(actionButton);

        const unfollowButton = await screen.findByTestId('unfollowButton');
        await user.click(unfollowButton);

        expect(await screen.findByTestId('unfollowLeaderConfirmation')).toBeInTheDocument();
      });
    });

    describe('detail panel', () => {
      test('should open a detail panel when clicking on a follower index', async () => {
        expect(screen.queryByTestId('followerIndexDetail')).not.toBeInTheDocument();

        const nameLink = within(table.getRows()[0]).getByText(index1.name);
        await user.click(nameLink);

        expect(await screen.findByTestId('followerIndexDetail')).toBeInTheDocument();
      });

      test('should set the title the index that has been selected', async () => {
        await actions.clickFollowerIndexAt(0);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        const title = within(detailPanel).getByTestId('title');
        expect(title.textContent).toEqual(index1.name);
      });

      test('should indicate the correct "status", "remote cluster" and "leader index"', async () => {
        await actions.clickFollowerIndexAt(0);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        const status = within(detailPanel).getByTestId('status');
        const remoteCluster = within(detailPanel).getByTestId('remoteCluster');
        const leaderIndex = within(detailPanel).getByTestId('leaderIndex');

        expect(status.textContent).toEqual(index1.status);
        expect(remoteCluster.textContent).toEqual(index1.remoteCluster);
        expect(leaderIndex.textContent).toEqual(index1.leaderIndex);
      });

      test('should have a "settings" section', async () => {
        await actions.clickFollowerIndexAt(0);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        const settingsSection = within(detailPanel).getByTestId('settingsSection');
        const heading = within(settingsSection).getByRole('heading', { level: 3 });
        expect(heading.textContent).toEqual('Settings');

        const settingsValues = within(detailPanel).queryAllByTestId('settingsValues');
        expect(settingsValues.length).toBeGreaterThan(0);
      });

      test('should set the correct follower index settings values', async () => {
        const mapSettingsToFollowerIndexProp: Record<string, keyof FollowerIndex> = {
          maxReadReqOpCount: 'maxReadRequestOperationCount',
          maxOutstandingReadReq: 'maxOutstandingReadRequests',
          maxReadReqSize: 'maxReadRequestSize',
          maxWriteReqOpCount: 'maxWriteRequestOperationCount',
          maxWriteReqSize: 'maxWriteRequestSize',
          maxOutstandingWriteReq: 'maxOutstandingWriteRequests',
          maxWriteBufferCount: 'maxWriteBufferCount',
          maxWriteBufferSize: 'maxWriteBufferSize',
          maxRetryDelay: 'maxRetryDelay',
          readPollTimeout: 'readPollTimeout',
        };

        await actions.clickFollowerIndexAt(0);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        // Wait for any settingsValues to appear
        await within(detailPanel).findByTestId('maxReadReqOpCount');

        Object.entries(mapSettingsToFollowerIndexProp).forEach(([setting, prop]) => {
          const element = within(detailPanel).getByTestId(setting);
          const value = index1[prop];
          expect(element.textContent).toEqual(value !== undefined ? String(value) : '');
        });
      });

      test('should not have settings values for a "paused" follower index', async () => {
        await actions.clickFollowerIndexAt(1);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        await within(detailPanel).findByTestId('settingsSection');

        expect(within(detailPanel).queryByTestId('settingsValues')).not.toBeInTheDocument();

        const settingsSection = within(detailPanel).getByTestId('settingsSection');
        expect(settingsSection.textContent).toContain(
          'paused follower index does not have settings'
        );
      });

      test('should have a section to render the follower index shards stats', async () => {
        await actions.clickFollowerIndexAt(0);

        const detailPanel = await screen.findByTestId('followerIndexDetail');
        expect(within(detailPanel).getByTestId('shardsStatsSection')).toBeInTheDocument();

        const codeBlocks = within(detailPanel).queryAllByTestId('shardsStats');
        expect(codeBlocks.length).toBe(index1.shards.length);

        codeBlocks.forEach((codeBlock: HTMLElement, i: number) => {
          expect(JSON.parse(codeBlock.textContent ?? '')).toEqual(index1.shards[i]);
        });
      });
    });
  });
});
