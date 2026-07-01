/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { screen } from '@testing-library/react';
import { setupEnvironment } from '../../helpers/setup_environment';
import { renderEditPolicy } from '../../helpers/render_edit_policy';
import { createDownsampleActions } from '../../helpers/actions/downsample_actions';
import { createTogglePhaseAction } from '../../helpers/actions/toggle_phase_action';

describe('<EditPolicy /> downsample', () => {
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

    const togglePhase = createTogglePhaseAction();

    await togglePhase('warm');
    await togglePhase('cold');
  });

  test('enabling downsample in hot should hide readonly in hot, warm and cold', async () => {
    expect(screen.getByTestId('hot-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('warm-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('cold-readonlySwitch')).toBeInTheDocument();

    const hotDownsampleActions = createDownsampleActions('hot');
    hotDownsampleActions.downsample.toggle();

    expect(screen.queryByTestId('hot-readonlySwitch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('warm-readonlySwitch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cold-readonlySwitch')).not.toBeInTheDocument();
  });

  test('enabling downsample in warm should hide readonly in warm and cold', async () => {
    expect(screen.getByTestId('hot-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('warm-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('cold-readonlySwitch')).toBeInTheDocument();

    const warmDownsampleActions = createDownsampleActions('warm');
    warmDownsampleActions.downsample.toggle();

    expect(screen.getByTestId('hot-readonlySwitch')).toBeInTheDocument();
    expect(screen.queryByTestId('warm-readonlySwitch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cold-readonlySwitch')).not.toBeInTheDocument();
  });

  test('enabling downsample in cold should hide readonly in cold', async () => {
    expect(screen.getByTestId('hot-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('warm-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('cold-readonlySwitch')).toBeInTheDocument();

    const coldDownsampleActions = createDownsampleActions('cold');
    coldDownsampleActions.downsample.toggle();

    expect(screen.getByTestId('hot-readonlySwitch')).toBeInTheDocument();
    expect(screen.getByTestId('warm-readonlySwitch')).toBeInTheDocument();
    expect(screen.queryByTestId('cold-readonlySwitch')).not.toBeInTheDocument();
  });
});
