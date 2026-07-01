/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import type { HttpFetchOptionsWithPath } from '@kbn/core/public';
import { setupEnvironment } from '../../helpers/setup_environment';
import { renderEditPolicy } from '../../helpers/render_edit_policy';
import { createTogglePhaseAction } from '../../helpers/actions/toggle_phase_action';
import { createRolloverActions } from '../../helpers/actions/rollover_actions';
import { createSearchableSnapshotActions } from '../../helpers/actions/searchable_snapshot_actions';
import { createForceMergeActions } from '../../helpers/actions/forcemerge_actions';
import { createShrinkActions } from '../../helpers/actions/shrink_actions';
import { createDownsampleActions } from '../../helpers/actions/downsample_actions';
import { createMinAgeActions } from '../../helpers/actions/min_age_actions';
import { createReadonlyActions } from '../../helpers/actions/readonly_actions';
import { getDefaultHotPhasePolicy } from '../constants';
import { API_BASE_PATH } from '../../../common/constants';
import { cloudMock } from '@kbn/cloud-plugin/public/mocks';

describe('<EditPolicy /> searchable snapshots', () => {
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const setup = async (args?: { appServicesContext?: any }) => {
    renderEditPolicy(httpSetup, args);
    await screen.findByTestId('hot-phase');
  };

  const createActions = () => ({
    togglePhase: createTogglePhaseAction(),
    savePolicy: () => fireEvent.click(screen.getByTestId('savePolicyButton')),
    ...createRolloverActions(),
    hot: {
      ...createSearchableSnapshotActions('hot'),
      ...createForceMergeActions('hot'),
      ...createShrinkActions('hot'),
      ...createDownsampleActions('hot'),
    },
    warm: {
      ...createForceMergeActions('warm'),
      ...createShrinkActions('warm'),
      ...createReadonlyActions('warm'),
      ...createDownsampleActions('warm'),
    },
    cold: {
      ...createMinAgeActions('cold'),
      ...createSearchableSnapshotActions('cold'),
      ...createReadonlyActions('cold'),
      ...createDownsampleActions('cold'),
    },
    frozen: {
      ...createMinAgeActions('frozen'),
      ...createSearchableSnapshotActions('frozen'),
    },
  });

  beforeEach(() => {
    ({ httpSetup, httpRequestsMockHelpers } = setupEnvironment());
    httpRequestsMockHelpers.setDefaultResponses();
  });

  test('force_merge_on_clone is hidden when force_merge_index is disabled', async () => {
    await setup();
    const actions = createActions();

    await actions.togglePhase('cold');
    await actions.cold.setMinAgeValue('10');
    await actions.cold.toggleSearchableSnapshot();
    await actions.cold.setSearchableSnapshot('myRepo');

    expect(await actions.cold.forceMergeIndexSwitchExists()).toBe(true);
    expect(await actions.cold.forceMergeOnCloneSwitchExists()).toBe(true);

    await actions.cold.toggleForceMergeIndex();

    expect(await actions.cold.forceMergeIndexIsChecked()).toBe(false);
    expect(await actions.cold.forceMergeOnCloneSwitchExists()).toBe(false);
  });

  test('saving strips force_merge_on_clone when force_merge_index is false', async () => {
    await setup();
    const actions = createActions();

    await actions.togglePhase('cold');
    await actions.cold.setMinAgeValue('10');
    await actions.cold.toggleSearchableSnapshot();
    await actions.cold.setSearchableSnapshot('myRepo');

    // Toggle opt-out first (sets `force_merge_on_clone: false`)
    await actions.cold.toggleForceMergeOnClone();
    expect(await actions.cold.forceMergeOnCloneIsChecked()).toBe(false);

    // Now disable force merge index (ES disallows force_merge_on_clone when force_merge_index is false)
    await actions.cold.toggleForceMergeIndex();
    expect(await actions.cold.forceMergeIndexIsChecked()).toBe(false);
    expect(await actions.cold.forceMergeOnCloneSwitchExists()).toBe(false);

    await actions.savePolicy();
    await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

    const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
    const [requestUrl, requestBody] = lastReq;
    const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

    expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.snapshot_repository).toBe(
      'myRepo'
    );
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.force_merge_index).toBe(false);
    expect(
      parsedReqBody.phases.cold.actions.searchable_snapshot.force_merge_on_clone
    ).toBeUndefined();
  });

  test('saving includes force_merge_on_clone=false when force_merge_index is enabled', async () => {
    await setup();
    const actions = createActions();

    await actions.togglePhase('cold');
    await actions.cold.setMinAgeValue('10');
    await actions.cold.toggleSearchableSnapshot();
    await actions.cold.setSearchableSnapshot('myRepo');

    // Default is checked (true, omitted), so toggle once to set it to false
    await actions.cold.toggleForceMergeOnClone();
    expect(await actions.cold.forceMergeOnCloneIsChecked()).toBe(false);

    await actions.savePolicy();
    await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

    const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
    const [requestUrl, requestBody] = lastReq;
    const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

    expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.snapshot_repository).toBe(
      'myRepo'
    );
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.force_merge_index).toBeUndefined();
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.force_merge_on_clone).toBe(false);
  });

  test('enabling searchable snapshot should hide force merge, readonly and shrink in subsequent phases', async () => {
    await setup();
    const actions = createActions();

    await actions.togglePhase('warm');
    await actions.togglePhase('cold');

    expect(actions.warm.forceMergeExists()).toBeTruthy();
    expect(actions.warm.shrinkExists()).toBeTruthy();
    expect(actions.warm.readonlyExists()).toBeTruthy();
    expect(actions.warm.downsample.exists()).toBeTruthy();
    expect(actions.cold.searchableSnapshotsExists()).toBeTruthy();
    expect(actions.cold.readonlyExists()).toBeTruthy();
    expect(actions.cold.downsample.exists()).toBeTruthy();

    await actions.hot.setSearchableSnapshot('my-repo');

    expect(actions.warm.forceMergeExists()).toBeFalsy();
    expect(actions.warm.shrinkExists()).toBeFalsy();
    expect(actions.warm.readonlyExists()).toBeFalsy();
    expect(actions.warm.downsample.exists()).toBeFalsy();
    // searchable snapshot in cold is still visible
    expect(actions.cold.searchableSnapshotsExists()).toBeTruthy();
    expect(actions.cold.readonlyExists()).toBeFalsy();
    expect(actions.cold.downsample.exists()).toBeFalsy();
  }, 10000);

  test('disabling and re-enabling rollover', async () => {
    await setup();
    const actions = createActions();
    actions.rollover.toggle();
    actions.rollover.toggle();

    expect(actions.hot.forceMergeExists()).toBeTruthy();
    expect(actions.hot.shrinkExists()).toBeTruthy();
    expect(actions.hot.searchableSnapshotsExists()).toBeTruthy();
  });

  test('should set the repository from previously defined repository', async () => {
    await setup();
    const actions = createActions();

    const repository = 'myRepo';
    await actions.hot.setSearchableSnapshot(repository);
    await actions.togglePhase('cold');
    await actions.cold.setMinAgeValue('10');
    await actions.cold.toggleSearchableSnapshot();
    await actions.togglePhase('frozen');
    await actions.frozen.setMinAgeValue('15');

    await actions.savePolicy();
    await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

    const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
    const [requestUrl, requestBody] = lastReq;
    const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

    expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
    expect(parsedReqBody.phases.hot.actions.searchable_snapshot.snapshot_repository).toBe(
      repository
    );
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.snapshot_repository).toBe(
      repository
    );
    expect(parsedReqBody.phases.frozen.actions.searchable_snapshot.snapshot_repository).toBe(
      repository
    );
  }, 10000);

  test('should update the repository in all searchable snapshot actions', async () => {
    await setup();
    const actions = createActions();

    await actions.hot.setSearchableSnapshot('myRepo');
    await actions.togglePhase('cold');
    await actions.cold.setMinAgeValue('10');
    await actions.cold.toggleSearchableSnapshot();
    await actions.togglePhase('frozen');
    await actions.frozen.setMinAgeValue('15');

    // We update the repository in one phase
    await actions.frozen.setSearchableSnapshot('changed');
    await actions.savePolicy();
    await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

    const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
    const [requestUrl, requestBody] = lastReq;
    const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

    expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
    // And all phases should be updated
    expect(parsedReqBody.phases.hot.actions.searchable_snapshot.snapshot_repository).toBe(
      'changed'
    );
    expect(parsedReqBody.phases.cold.actions.searchable_snapshot.snapshot_repository).toBe(
      'changed'
    );
    expect(parsedReqBody.phases.frozen.actions.searchable_snapshot.snapshot_repository).toBe(
      'changed'
    );
  }, 15000);

  describe('on cloud', () => {
    describe('new policy', () => {
      beforeEach(async () => {
        // simulate creating a new policy
        httpRequestsMockHelpers.setLoadPolicies([getDefaultHotPhasePolicy('')]);
        httpRequestsMockHelpers.setListNodes({
          isUsingDeprecatedDataRoleConfig: false,
          nodesByAttributes: { test: ['123'] },
          nodesByRoles: { data: ['123'] },
        });
        httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['found-snapshots'] });

        // Re-render with new context
        await setup({
          appServicesContext: { cloud: { ...cloudMock.createSetup(), isCloudEnabled: true } },
        });
      });

      test('defaults searchable snapshot to true on cloud', async () => {
        const actions = createActions();
        await actions.togglePhase('cold');
        const container = screen.getByTestId('searchableSnapshotField-cold');
        const toggle = within(container).getByTestId('searchableSnapshotToggle');
        expect(toggle).toHaveAttribute('aria-checked', 'true');
      });
    });

    describe('existing policy', () => {
      beforeEach(async () => {
        httpRequestsMockHelpers.setLoadPolicies([getDefaultHotPhasePolicy()]);
        httpRequestsMockHelpers.setListNodes({
          isUsingDeprecatedDataRoleConfig: false,
          nodesByAttributes: { test: ['123'] },
          nodesByRoles: { data: ['123'] },
        });
        httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['found-snapshots'] });

        // Re-render with new context
        await setup({
          appServicesContext: { cloud: { ...cloudMock.createSetup(), isCloudEnabled: true } },
        });
      });

      test('correctly sets snapshot repository default to "found-snapshots"', async () => {
        const actions = createActions();
        await actions.togglePhase('cold');
        await actions.cold.setMinAgeValue('10');
        await actions.cold.toggleSearchableSnapshot();

        await actions.savePolicy();
        await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

        const lastReq: HttpFetchOptionsWithPath[] = httpSetup.post.mock.calls.pop() || [];
        const [requestUrl, requestBody] = lastReq;
        const parsedReqBody = JSON.parse((requestBody as Record<string, any>).body);

        expect(requestUrl).toBe(`${API_BASE_PATH}/policies`);
        expect(parsedReqBody.phases.cold.actions.searchable_snapshot.snapshot_repository).toEqual(
          'found-snapshots'
        );
      });
    });
  });

  describe('on non-enterprise license', () => {
    beforeEach(async () => {
      httpRequestsMockHelpers.setLoadPolicies([getDefaultHotPhasePolicy()]);
      httpRequestsMockHelpers.setListNodes({
        isUsingDeprecatedDataRoleConfig: false,
        nodesByAttributes: { test: ['123'] },
        nodesByRoles: { data: ['123'] },
      });
      httpRequestsMockHelpers.setListSnapshotRepos({ repositories: ['my-repo'] });

      // Setup with basic license context
      await setup({
        appServicesContext: {
          license: licensingMock.createLicense({ license: { type: 'basic' } }),
        },
      });
    });

    test('disable setting searchable snapshots', async () => {
      const actions = createActions();

      expect(actions.hot.searchableSnapshotsExists()).toBeFalsy();
      expect(actions.cold.searchableSnapshotsExists()).toBeFalsy();
      expect(actions.frozen.searchableSnapshotsExists()).toBeFalsy();

      await actions.togglePhase('cold');

      // Still hidden in hot
      expect(actions.hot.searchableSnapshotsExists()).toBeFalsy();

      expect(actions.cold.searchableSnapshotsExists()).toBeTruthy();
      expect(actions.cold.searchableSnapshotDisabledDueToLicense()).toBeTruthy();
    });
  });
});
