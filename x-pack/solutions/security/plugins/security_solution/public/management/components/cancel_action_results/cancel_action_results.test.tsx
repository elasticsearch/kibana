/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ActionDetails, MaybeImmutable } from '../../../../common/endpoint/types';
import type { AppContextTestRender } from '../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../common/mock/endpoint';
import { EndpointActionGenerator } from '../../../../common/endpoint/data_generators/endpoint_action_generator';
import { CancelActionResults } from './cancel_action_results';
import { endpointActionResponseCodes } from '../endpoint_responder/lib/endpoint_action_response_codes';
import { RESPONSE_ACTION_STATUS } from '../../common/translations';

describe('CancelActionResults', () => {
  const testPrefix = 'test';

  let appTestContext: AppContextTestRender;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;
  let action: MaybeImmutable<ActionDetails>;

  beforeEach(() => {
    appTestContext = createAppRootMockRenderer();
    action = new EndpointActionGenerator('test').generateActionDetails({
      agents: ['agent-a'],
      command: 'cancel',
    });

    render = () =>
      (renderResult = appTestContext.render(
        <CancelActionResults action={action} data-test-subj={testPrefix} />
      ));
  });

  it('should render an empty div and log an error when agentId is not in action.agents', () => {
    const consoleSpy = jest.spyOn(window.console, 'error').mockImplementation(() => {});

    renderResult = appTestContext.render(
      <CancelActionResults
        action={action}
        agentId="non-existent-agent"
        data-test-subj={testPrefix}
      />
    );

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-existent-agent'));
    expect(renderResult.getByTestId(testPrefix)).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it('should show pending message when action is not completed', () => {
    action = {
      ...action,
      agentState: {
        'agent-a': {
          isCompleted: false,
          wasSuccessful: false,
          wasCanceled: false,
          completedAt: undefined,
          errors: undefined,
        },
      },
    };

    render();

    expect(renderResult.getByTestId(`${testPrefix}-pending`).textContent).toEqual(
      RESPONSE_ACTION_STATUS.pendingMessage
    );
  });

  it('should show failure message component when action failed', () => {
    action = {
      ...action,
      isCompleted: true,
      wasSuccessful: false,
      errors: ['Some failure'],
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: ['Some failure'],
        },
      },
    };

    render();

    expect(
      renderResult.getByTestId(`${testPrefix}-failure-response-action-failure-info`)
    ).not.toBeNull();
  });

  it('should show default success message when action succeeded with no output code', () => {
    action = {
      ...action,
      isCompleted: true,
      wasSuccessful: true,
      outputs: undefined,
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
    };

    render();

    expect(renderResult.getByTestId(`${testPrefix}-success`).textContent).toEqual(
      RESPONSE_ACTION_STATUS.successMessage
    );
  });

  it('should show the response code message when action succeeded with a known cancel code', () => {
    action = {
      ...action,
      isCompleted: true,
      wasSuccessful: true,
      outputs: {
        'agent-a': {
          type: 'json',
          content: {
            code: 'ra_cancel_success_done',
          },
        },
      },
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
    };

    render();

    expect(renderResult.getByTestId(`${testPrefix}-success`).textContent).toEqual(
      endpointActionResponseCodes.ra_cancel_success_done
    );
  });

  it('should show default success message when action succeeded with an unknown output code', () => {
    action = {
      ...action,
      isCompleted: true,
      wasSuccessful: true,
      outputs: {
        'agent-a': {
          type: 'json',
          content: {
            code: 'ra_unknown_code',
          },
        },
      },
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
    };

    render();

    expect(renderResult.getByTestId(`${testPrefix}-success`).textContent).toEqual(
      RESPONSE_ACTION_STATUS.successMessage
    );
  });

  it('should default to first agent when agentId prop is not provided', () => {
    action = new EndpointActionGenerator('test').generateActionDetails({
      agents: ['agent-a', 'agent-b'],
      command: 'isolate',
    });
    action = {
      ...action,
      isCompleted: true,
      wasSuccessful: true,
      outputs: {
        'agent-a': {
          type: 'json',
          content: { code: 'ra_cancel_success_done' },
        },
        'agent-b': {
          type: 'json',
          content: { code: 'ra_cancel_success_forced' },
        },
      },
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
        'agent-b': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
    };

    renderResult = appTestContext.render(
      <CancelActionResults action={action} data-test-subj={testPrefix} />
    );

    expect(renderResult.getByTestId(`${testPrefix}-success`).textContent).toEqual(
      endpointActionResponseCodes.ra_cancel_success_done
    );
  });

  it('should use the specified agentId when provided', () => {
    action = new EndpointActionGenerator('test').generateActionDetails({
      agents: ['agent-a', 'agent-b'],
      command: 'isolate',
    });
    action = {
      ...action,
      isCompleted: true,
      wasSuccessful: true,
      outputs: {
        'agent-a': {
          type: 'json',
          content: { code: 'ra_cancel_success_done' },
        },
        'agent-b': {
          type: 'json',
          content: { code: 'ra_cancel_success_forced' },
        },
      },
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
        'agent-b': {
          isCompleted: true,
          wasSuccessful: true,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
    };

    renderResult = appTestContext.render(
      <CancelActionResults action={action} agentId="agent-b" data-test-subj={testPrefix} />
    );

    expect(renderResult.getByTestId(`${testPrefix}-success`).textContent).toEqual(
      endpointActionResponseCodes.ra_cancel_success_forced
    );
  });
});
