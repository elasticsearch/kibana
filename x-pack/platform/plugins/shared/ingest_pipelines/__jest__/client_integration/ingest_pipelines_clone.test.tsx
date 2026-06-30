/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@kbn/code-editor-mock/jest_helper';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryHistory } from 'history';
import { Route, Router } from '@kbn/shared-ux-router';

import { API_BASE_PATH } from '../../common/constants';
import { PipelinesClone } from '../../public/application/sections/pipelines_clone';
import { getClonePath, ROUTES } from '../../public/application/services/navigation';
import { setupEnvironment, WithAppDependencies } from './helpers/setup_environment';

describe('<PipelinesClone />', () => {
  const { httpSetup, httpRequestsMockHelpers } = setupEnvironment();
  const originalLocation = window.location;

  const PIPELINE_TO_CLONE = {
    name: 'my_pipeline',
    description: 'pipeline description',
    field_access_pattern: 'classic',
    processors: [
      {
        set: {
          field: 'foo',
          value: 'new',
        },
      },
    ],
  };

  const renderPipelinesClone = async () => {
    const history = createMemoryHistory({
      initialEntries: [getClonePath({ clonedPipelineName: PIPELINE_TO_CLONE.name })],
    });

    const Wrapped = WithAppDependencies(PipelinesClone, httpSetup);
    render(
      <Router history={history}>
        <Route path={ROUTES.clone} component={Wrapped} />
      </Router>
    );

    await screen.findByTestId('pipelineForm');
  };

  beforeEach(() => {
    jest.clearAllMocks();
    httpRequestsMockHelpers.setLoadPipelineResponse(PIPELINE_TO_CLONE.name, PIPELINE_TO_CLONE);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        pathname: getClonePath({ clonedPipelineName: PIPELINE_TO_CLONE.name }),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  test('should render the correct page header', async () => {
    await renderPipelinesClone();

    expect(screen.getByTestId('pageTitle')).toHaveTextContent('Create pipeline');
    expect(screen.getByTestId('documentationLink')).toHaveTextContent('Create pipeline docs');
  });

  test('should send the correct payload', async () => {
    await renderPipelinesClone();

    const postCallsBefore = httpSetup.post.mock.calls.length;
    fireEvent.click(screen.getByTestId('submitButton'));

    await waitFor(() => expect(httpSetup.post.mock.calls.length).toBeGreaterThan(postCallsBefore));
    const createRequest = httpSetup.post.mock.results[postCallsBefore]?.value as
      | Promise<unknown>
      | undefined;
    expect(createRequest).toBeDefined();
    await waitFor(async () => {
      await createRequest;
    });

    expect(httpSetup.post).toHaveBeenLastCalledWith(
      API_BASE_PATH,
      expect.objectContaining({
        body: JSON.stringify({
          ...PIPELINE_TO_CLONE,
          name: `${PIPELINE_TO_CLONE.name}-copy`,
        }),
      })
    );
  });
});
