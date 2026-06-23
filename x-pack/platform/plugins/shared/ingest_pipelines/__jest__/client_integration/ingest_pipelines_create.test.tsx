/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@kbn/code-editor-mock/jest_helper';

import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Route, Router } from '@kbn/shared-ux-router';

import { API_BASE_PATH } from '../../common/constants';
import { PipelinesCreate } from '../../public/application/sections/pipelines_create';
import { getCreatePath, ROUTES } from '../../public/application/services/navigation';
import { setupEnvironment, WithAppDependencies } from './helpers/setup_environment';
import { nestedProcessorsErrorFixture } from './fixtures';

const getInput = (testSubj: string) => {
  const el = screen.getByTestId(testSubj) as HTMLElement;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    return el as HTMLInputElement | HTMLTextAreaElement;
  }
  return within(el).getByRole('textbox') as HTMLInputElement | HTMLTextAreaElement;
};

type TestHttpSetup = ReturnType<typeof setupEnvironment>['httpSetup'];
type TestHttpRequestsMockHelpers = ReturnType<typeof setupEnvironment>['httpRequestsMockHelpers'];

const renderPipelinesCreate = async (httpSetup: TestHttpSetup, queryParams: string = '') => {
  const history = createMemoryHistory({
    initialEntries: [`${getCreatePath()}${queryParams}`],
  });

  const Wrapped = WithAppDependencies(PipelinesCreate, httpSetup);
  render(
    <Router history={history}>
      <Route path={ROUTES.create} component={Wrapped} />
    </Router>
  );

  await screen.findByTestId('pipelineForm');
  await screen.findByTestId('descriptionField');
  // Wait for the processors editor context to mount and register its onUpdate handler.
  // pipelineProcessorsMoveAnnouncement lives inside PipelineProcessorsContextProvider
  // alongside the onUpdate useEffect, so its presence guarantees the effect has run.
  await screen.findByTestId('pipelineProcessorsMoveAnnouncement');
};

describe('<PipelinesCreate />', () => {
  // Each test gets a fresh httpSetup + mockResponses Map so mock state can't leak
  // between tests. jest.clearAllMocks() only clears call history, not the Map.
  let httpSetup!: TestHttpSetup;
  let httpRequestsMockHelpers!: TestHttpRequestsMockHelpers;

  beforeEach(() => {
    const env = setupEnvironment();
    httpSetup = env.httpSetup;
    httpRequestsMockHelpers = env.httpRequestsMockHelpers;

    jest.clearAllMocks();
  });

  test('should render the correct page header', async () => {
    await renderPipelinesCreate(httpSetup);

    expect(screen.getByTestId('pageTitle')).toHaveTextContent('Create pipeline');
    expect(screen.getByTestId('documentationLink')).toHaveTextContent('Create pipeline docs');
  });

  test('should toggle the version field', async () => {
    await renderPipelinesCreate(httpSetup);

    const versionField = screen.getByTestId('versionField');
    const versionInput = within(versionField).getByTestId('input');
    expect(versionInput).toBeDisabled();
    fireEvent.click(screen.getByTestId('versionToggle'));
    await waitFor(() => expect(versionInput).not.toBeDisabled());
  });

  test('should toggle the _meta field', async () => {
    await renderPipelinesCreate(httpSetup);

    expect(screen.getByTestId('metaToggle')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('metaToggle'));
    expect(screen.getByTestId('metaToggle')).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByTestId('metaEditor')).toBeInTheDocument();
  });

  test('should show the request flyout', async () => {
    await renderPipelinesCreate(httpSetup);

    fireEvent.click(screen.getByTestId('showRequestLink'));
    expect(await screen.findByText('Request')).toBeInTheDocument();
  });

  test('should allow to prepopulate the name field', async () => {
    await renderPipelinesCreate(httpSetup, '?name=test-pipeline');

    const nameInput = getInput('nameField');
    expect(nameInput).toBeDisabled();
    expect(nameInput).toHaveValue('test-pipeline');
  });

  test('should prevent form submission if required fields are missing', async () => {
    await renderPipelinesCreate(httpSetup);

    fireEvent.click(screen.getByTestId('submitButton'));

    expect((await screen.findAllByText('Name is required.')).length).toBeGreaterThan(0);
    expect(screen.getByTestId('submitButton')).toBeDisabled();

    fireEvent.change(getInput('nameField'), { target: { value: 'my_pipeline' } });
    await waitFor(() => expect(screen.getByTestId('submitButton')).not.toBeDisabled());
  });

  test('should send the correct payload', async () => {
    const user = userEvent.setup();
    await renderPipelinesCreate(httpSetup);

    await user.type(getInput('nameField'), 'my_pipeline');
    await user.type(getInput('descriptionField'), 'pipeline description');

    fireEvent.click(screen.getByTestId('metaToggle'));
    await screen.findByTestId('metaEditor');

    const metaData = { field1: 'hello', field2: 10 };
    fireEvent.change(screen.getByTestId('metaEditor'), {
      target: { value: JSON.stringify(metaData) },
    });

    fireEvent.click(screen.getByTestId('submitButton'));
    await waitFor(() => expect(httpSetup.post).toHaveBeenCalled());

    expect(httpSetup.post).toHaveBeenCalledWith(
      API_BASE_PATH,
      expect.objectContaining({
        body: JSON.stringify({
          name: 'my_pipeline',
          description: 'pipeline description',
          _meta: metaData,
          processors: [],
        }),
      })
    );
  });

  test('should surface API errors from the request', async () => {
    const user = userEvent.setup();
    await renderPipelinesCreate(httpSetup);

    await user.type(getInput('nameField'), 'my_pipeline');
    await user.type(getInput('descriptionField'), 'pipeline description');

    const error = {
      statusCode: 409,
      error: 'Conflict',
      message: `There is already a pipeline with name 'my_pipeline'.`,
    };

    httpRequestsMockHelpers.setCreatePipelineResponse(undefined, error);
    fireEvent.click(screen.getByTestId('submitButton'));

    const callout = await screen.findByTestId('savePipelineError');
    expect(callout).toHaveTextContent(error.message);
  });

  test('displays nested pipeline errors as a flat list', async () => {
    const user = userEvent.setup();
    await renderPipelinesCreate(httpSetup);

    await user.type(getInput('nameField'), 'my_pipeline');
    await user.type(getInput('descriptionField'), 'pipeline description');

    httpRequestsMockHelpers.setCreatePipelineResponse(undefined, {
      statusCode: 409,
      message: 'Error',
      ...nestedProcessorsErrorFixture,
    });

    fireEvent.click(screen.getByTestId('submitButton'));

    const callout = await screen.findByTestId('savePipelineError');
    expect(within(callout).getByTestId('showErrorsButton')).toBeInTheDocument();

    fireEvent.click(within(callout).getByTestId('showErrorsButton'));

    await waitFor(() => expect(within(callout).queryByTestId('showErrorsButton')).toBeNull());
    expect(within(callout).getByTestId('hideErrorsButton')).toBeInTheDocument();
    expect(within(callout).getAllByRole('listitem')).toHaveLength(8);
  });
});
