/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen, waitFor } from '@testing-library/react';
import { setupEnvironment } from '../../helpers/setup_environment';
import { renderEditPolicy } from '../../helpers/render_edit_policy';
import { createRolloverActions } from '../../helpers/actions/rollover_actions';
import { createTogglePhaseAction } from '../../helpers/actions/toggle_phase_action';

describe('<EditPolicy /> rollover', () => {
  let httpRequestsMockHelpers: ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];
  let httpSetup: ReturnType<typeof setupEnvironment>['httpSetup'];

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    ({ httpRequestsMockHelpers, httpSetup } = setupEnvironment());
    httpRequestsMockHelpers.setDefaultResponses();

    renderEditPolicy(httpSetup);

    await screen.findByTestId('savePolicyButton');
  });

  test('shows forcemerge when rollover enabled', () => {
    expect(screen.getByTestId('hot-forceMergeSwitch')).toBeInTheDocument();
  });

  test('hides forcemerge when rollover is disabled', async () => {
    const rolloverActions = createRolloverActions();
    rolloverActions.rollover.toggle();
    expect(screen.queryByTestId('hot-forceMergeSwitch')).not.toBeInTheDocument();
  });

  test('shows shrink input when rollover enabled', () => {
    expect(screen.getByTestId('hot-shrinkSwitch')).toBeInTheDocument();
  });

  test('hides shrink input when rollover is disabled', async () => {
    const rolloverActions = createRolloverActions();
    rolloverActions.rollover.toggle();
    expect(screen.queryByTestId('hot-shrinkSwitch')).not.toBeInTheDocument();
  });

  test('shows readonly input when rollover enabled', () => {
    expect(screen.getByTestId('hot-readonlySwitch')).toBeInTheDocument();
  });

  test('hides readonly input when rollover is disabled', async () => {
    const rolloverActions = createRolloverActions();
    rolloverActions.rollover.toggle();
    expect(screen.queryByTestId('hot-readonlySwitch')).not.toBeInTheDocument();
  });

  test('hides and disables searchable snapshot field', async () => {
    const togglePhase = createTogglePhaseAction();
    expect(screen.getByTestId('searchableSnapshotField-hot')).toBeInTheDocument();

    const rolloverActions = createRolloverActions();
    rolloverActions.rollover.toggle();
    await togglePhase('cold');

    expect(screen.queryByTestId('searchableSnapshotField-hot')).not.toBeInTheDocument();
  });

  test('shows rollover tip on minimum age', async () => {
    const togglePhase = createTogglePhaseAction();
    await togglePhase('warm');
    await togglePhase('cold');
    await togglePhase('frozen');
    await togglePhase('delete');

    expect(screen.getByTestId('warm-rolloverMinAgeInputIconTip')).toBeInTheDocument();
    expect(screen.getByTestId('cold-rolloverMinAgeInputIconTip')).toBeInTheDocument();
    expect(screen.getByTestId('frozen-rolloverMinAgeInputIconTip')).toBeInTheDocument();
    expect(screen.getByTestId('delete-rolloverMinAgeInputIconTip')).toBeInTheDocument();
  });

  test('hiding rollover tip on minimum age', async () => {
    const rolloverActions = createRolloverActions();
    const togglePhase = createTogglePhaseAction();

    rolloverActions.rollover.toggle();

    await togglePhase('warm');
    await togglePhase('cold');
    await togglePhase('frozen');
    await togglePhase('delete');

    expect(screen.queryByTestId('warm-rolloverMinAgeInputIconTip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cold-rolloverMinAgeInputIconTip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('frozen-rolloverMinAgeInputIconTip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('delete-rolloverMinAgeInputIconTip')).not.toBeInTheDocument();
  });

  test('restore recommended defaults is enabled by restrictions and removes min fields', async () => {
    const rolloverActions = createRolloverActions();
    const restoreDefaultsButton = screen.getByTestId('rolloverRestoreRecommendedDefaults');

    expect(restoreDefaultsButton).toBeDisabled();

    await rolloverActions.rollover.setMinDocs('12');

    await waitFor(() => {
      expect(screen.getByTestId('rolloverRestoreRecommendedDefaults')).toBeEnabled();
    });

    rolloverActions.rollover.restoreRecommendedDefaults();

    await waitFor(() => {
      expect(screen.queryByTestId('hot-selectedMinDocuments')).not.toBeInTheDocument();
      expect(restoreDefaultsButton).toBeDisabled();
    });
  });
});
