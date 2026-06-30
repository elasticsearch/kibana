/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Route } from '@kbn/shared-ux-router';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { createDiscoverServicesMock } from '../../__mocks__/services';
import { DiscoverTestProvider } from '../../__mocks__/test_provider';
import {
  type ContextAwarenessToolkit,
  type ProfileStateDefinition,
  ProfileStateType,
} from '../../context_awareness';
import { SingleDocRoute } from './single_doc_route';

interface TestProfileState {
  color: string;
}

const TEST_PROFILE_STATE_DEF: ProfileStateDefinition<TestProfileState> = {
  key: 'singleDocRouteTestProfileState',
  descriptor: {
    color: { type: ProfileStateType.Ui },
  },
  defaultState: {
    color: 'default',
  },
};

describe('SingleDocRoute', () => {
  it('provides an in-memory profile state toolkit', async () => {
    const services = createDiscoverServicesMock();
    const originalCreateScopedProfilesManager =
      services.profilesManager.createScopedProfilesManager.bind(services.profilesManager);
    let capturedToolkit: ContextAwarenessToolkit | undefined;

    services.profileStateRegistry.registerDefinition(TEST_PROFILE_STATE_DEF);
    jest
      .spyOn(services.profilesManager, 'createScopedProfilesManager')
      .mockImplementation((args) => {
        capturedToolkit = args.toolkit;
        return originalCreateScopedProfilesManager(args);
      });

    render(
      <DiscoverTestProvider services={services}>
        <MemoryRouter initialEntries={[`/doc/${dataViewMock.id}/test-index`]}>
          <Route path="/doc/:dataViewId/:index">
            <SingleDocRoute />
          </Route>
        </MemoryRouter>
      </DiscoverTestProvider>
    );

    await waitFor(() => expect(capturedToolkit).toBeDefined());

    const stateAdapter = capturedToolkit!.getStateAdapter(TEST_PROFILE_STATE_DEF);
    expect(stateAdapter.getState()).toEqual(TEST_PROFILE_STATE_DEF.defaultState);

    stateAdapter.setState({ color: 'primary' });
    stateAdapter.updateState({ color: 'success' });

    expect(stateAdapter.getState()).toEqual({ color: 'success' });
  });
});
