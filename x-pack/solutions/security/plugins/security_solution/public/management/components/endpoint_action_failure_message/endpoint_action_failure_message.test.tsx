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
import { EndpointActionFailureMessage } from './endpoint_action_failure_message';

describe('EndpointActionFailureMessage', () => {
  const testPrefix = 'test';
  const testId = `${testPrefix}-response-action-failure-info`;

  let appTestContext: AppContextTestRender;
  let render: () => ReturnType<AppContextTestRender['render']>;
  let renderResult: ReturnType<typeof render>;
  let action: MaybeImmutable<ActionDetails>;

  beforeEach(() => {
    appTestContext = createAppRootMockRenderer();
    action = new EndpointActionGenerator('seed').generateActionDetails({});

    render = () =>
      (renderResult = appTestContext.render(
        <EndpointActionFailureMessage action={action} data-test-subj={testPrefix} />
      ));
  });

  it('should not render when action is not completed', () => {
    action = { ...action, agents: ['agent-fails-a-lot'], isCompleted: false };
    render();
    expect(renderResult.queryByTestId(testId)).toBeNull();
  });

  it('should not render when action is successful', () => {
    action = { ...action, agents: ['agent-fails-a-lot'], wasSuccessful: true };
    render();
    expect(renderResult.queryByTestId(testId)).toBeNull();
  });

  it('should show canceled message when action.wasCanceled is true and no errors', () => {
    action = {
      ...action,
      agents: ['agent-a'],
      isCompleted: true,
      wasSuccessful: false,
      wasCanceled: true,
      hosts: { 'agent-a': { name: 'Agent A' } },
      errors: undefined,
      agentState: {
        'agent-a': {
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: true,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
      outputs: undefined,
    };
    render();
    const { getByTestId } = renderResult;
    const element = getByTestId(testId);
    expect(element).not.toBeNull();
    expect(element.textContent).toContain('Canceled ');
  });

  it('should render `unknown error` when no errors/outputs', () => {
    action = {
      ...action,
      agents: ['agent-fails-a-lot'],
      command: 'scan',
      isCompleted: true,
      wasSuccessful: false,
      hosts: {
        'agent-fails-a-lot': {
          name: 'Fails-a-lot',
        },
      },
      errors: undefined,
      agentState: {
        'agent-fails-a-lot': {
          isCompleted: true,
          wasSuccessful: false,
          wasCanceled: false,
          completedAt: new Date().toISOString(),
          errors: undefined,
        },
      },
      outputs: undefined,
    };
    render();
    const { getByTestId } = renderResult;
    const unknownErrorMessage = getByTestId(testId);

    expect(unknownErrorMessage).not.toBeNull();
    expect(unknownErrorMessage.textContent).toEqual(
      'The following errors were encountered:An unknown error occurred'
    );
  });

  describe('when there is a single agent for the action', () => {
    it('should show errors and outputs for an agent', () => {
      action = {
        ...action,
        agents: ['agent-fails-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-fails-a-lot': {
            name: 'Fails-a-lot',
          },
        },
        errors: ['Error info A', 'Error info B', 'Error info C'],
        agentState: {
          'agent-fails-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info A', 'Error info B', 'Error info C'],
          },
        },
        outputs: {
          'agent-fails-a-lot': {
            type: 'json',
            content: {
              code: 'ra_scan_error_queue-quota',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following errors were encountered:Too many scans are queued | Error info A | Error info B | Error info C'
      );
    });

    it('should show errors for an agent when unknown output code', () => {
      action = {
        ...action,
        agents: ['agent-fails-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-fails-a-lot': {
            name: 'Fails-a-lot',
          },
        },
        errors: ['Error info A', 'Error info B', 'Error info C'],
        agentState: {
          'agent-fails-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info A', 'Error info B', 'Error info C'],
          },
        },
        outputs: {
          'agent-fails-a-lot': {
            type: 'json',
            content: {
              code: 'non_existent_code',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following errors were encountered:Error info A | Error info B | Error info C'
      );
    });

    it('should show single error for an agent when unknown output code', () => {
      action = {
        ...action,
        agents: ['agent-fails-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-fails-a-lot': {
            name: 'Fails-a-lot',
          },
        },
        errors: ['Error info A'],
        agentState: {
          'agent-fails-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info A'],
          },
        },
        outputs: {
          'agent-fails-a-lot': {
            type: 'json',
            content: {
              code: 'non_existent_code',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following error was encountered:Error info A'
      );
    });
  });

  describe('when there are multiple agents for the action', () => {
    it('should show errors and outputs for each agent grouped by Host/Errors', () => {
      action = {
        ...action,
        agents: ['agent-fails-a-lot', 'agent-errs-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-fails-a-lot': {
            name: 'Fails-a-lot',
          },
          'agent-errs-a-lot': {
            name: 'Errs-a-lot',
          },
        },
        errors: ['Error info A', 'Error info B', 'Error info C'],
        agentState: {
          'agent-fails-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info A', 'Error info B', 'Error info C'],
          },
          'agent-errs-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info P', 'Error info Q', 'Error info R'],
          },
        },
        outputs: {
          'agent-fails-a-lot': {
            type: 'json',
            content: {
              code: 'ra_scan_error_queue-quota',
            },
          },
          'agent-errs-a-lot': {
            type: 'json',
            content: {
              code: 'ra_scan_error_not-found',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following errors were encountered:Host: Fails-a-lotErrors: Too many scans are queued | Error info A | Error info B | Error info CHost: Errs-a-lotErrors: File path or folder was not found | Error info P | Error info Q | Error info R'
      );
    });

    it('should show errors for each agent grouped by Host/Errors, when unknown output codes', () => {
      action = {
        ...action,
        agents: ['agent-fails-a-lot', 'agent-errs-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-fails-a-lot': {
            name: 'Fails-a-lot',
          },
          'agent-errs-a-lot': {
            name: 'Errs-a-lot',
          },
        },
        errors: [
          'Error info A',
          'Error info B',
          'Error info C',
          'Error info P',
          'Error info Q',
          'Error info R',
        ],
        agentState: {
          'agent-fails-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info A', 'Error info B', 'Error info C'],
          },
          'agent-errs-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info P', 'Error info Q', 'Error info R'],
          },
        },
        outputs: {
          'agent-fails-a-lot': {
            type: 'json',
            content: {
              code: 'non_existent_code',
            },
          },
          'agent-errs-a-lot': {
            type: 'json',
            content: {
              code: 'non_existent_code',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following errors were encountered:Host: Fails-a-lotErrors: Error info A | Error info B | Error info CHost: Errs-a-lotErrors: Error info P | Error info Q | Error info R'
      );
    });

    it('should show errors and outputs for each agent grouped by Host/Errors for agents that have errors', () => {
      action = {
        ...action,
        agents: ['agent-runs-a-lot', 'agent-errs-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-runs-a-lot': {
            name: 'runs-a-lot',
          },
          'agent-errs-a-lot': {
            name: 'Errs-a-lot',
          },
        },
        errors: ['Error info P', 'Error info Q', 'Error info R'],
        agentState: {
          'agent-runs-a-lot': {
            isCompleted: true,
            wasSuccessful: true,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: undefined,
          },
          'agent-errs-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error info P', 'Error info Q', 'Error info R'],
          },
        },
        outputs: {
          'agent-runs-a-lot': {
            type: 'json',
            content: {
              code: 'non_existent_code',
            },
          },
          'agent-errs-a-lot': {
            type: 'json',
            content: {
              code: 'ra_scan_error_not-found',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following errors were encountered:Host: Errs-a-lotErrors: File path or folder was not found | Error info P | Error info Q | Error info R'
      );
    });

    it('should show errors and outputs for each agent grouped by Host/Errors for agents that have a single error/output code', () => {
      action = {
        ...action,
        agents: ['agent-runs-a-lot', 'agent-errs-a-lot'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-runs-a-lot': {
            name: 'runs-a-lot',
          },
          'agent-errs-a-lot': {
            name: 'Errs-a-lot',
          },
        },
        errors: [],
        agentState: {
          'agent-runs-a-lot': {
            isCompleted: true,
            wasSuccessful: true,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: undefined,
          },
          'agent-errs-a-lot': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: [],
          },
        },
        outputs: {
          'agent-runs-a-lot': {
            type: 'json',
            content: {
              code: 'non_existent_code',
            },
          },
          'agent-errs-a-lot': {
            type: 'json',
            content: {
              code: 'ra_scan_error_not-found',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;

      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain(
        'The following error was encountered:Host: Errs-a-lotErrors: File path or folder was not found'
      );
    });
  });

  describe('when action was canceled', () => {
    it('should show canceled message for single agent with errors and wasCanceled via output canceled_by=action', () => {
      action = {
        ...action,
        agents: ['agent-a'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        wasCanceled: true,
        hosts: { 'agent-a': { name: 'Agent A' } },
        errors: ['Scan stopped'],
        agentState: {
          'agent-a': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: true,
            completedAt: new Date().toISOString(),
            errors: ['Scan stopped'],
          },
        },
        outputs: {
          'agent-a': {
            type: 'json',
            content: {
              code: 'ra_scan_error_canceled',
              canceled_by: 'action',
              canceled_id: 'cancel-action-id-1',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;
      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain('Canceled by action id: cancel-action-id-1');
      expect(errorMessages.textContent).toContain('Scan stopped');
    });

    it('should show manually canceled message for single agent when canceled_by=manual', () => {
      action = {
        ...action,
        agents: ['agent-a'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        wasCanceled: true,
        hosts: { 'agent-a': { name: 'Agent A' } },
        errors: ['Scan stopped'],
        agentState: {
          'agent-a': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: true,
            completedAt: new Date().toISOString(),
            errors: ['Scan stopped'],
          },
        },
        outputs: {
          'agent-a': {
            type: 'json',
            content: {
              code: 'ra_scan_error_canceled',
              canceled_by: 'manual',
              canceled_id: '',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;
      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain('Canceled manually on the host');
      expect(errorMessages.textContent).toContain('Scan stopped');
    });

    it('should show canceled message for each agent in multi-agent action when agents are canceled', () => {
      action = {
        ...action,
        agents: ['agent-a', 'agent-b'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        wasCanceled: true,
        hosts: {
          'agent-a': { name: 'Agent A' },
          'agent-b': { name: 'Agent B' },
        },
        errors: ['Scan stopped'],
        agentState: {
          'agent-a': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: true,
            completedAt: new Date().toISOString(),
            errors: ['Scan stopped on A'],
          },
          'agent-b': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: true,
            completedAt: new Date().toISOString(),
            errors: ['Scan stopped on B'],
          },
        },
        outputs: {
          'agent-a': {
            type: 'json',
            content: {
              code: 'ra_scan_error_canceled',
              canceled_by: 'action',
              canceled_id: 'cancel-id-abc',
            },
          },
          'agent-b': {
            type: 'json',
            content: {
              code: 'ra_scan_error_canceled',
              canceled_by: 'manual',
              canceled_id: '',
            },
          },
        },
      };
      render();
      const { getByTestId } = renderResult;
      const errorMessages = getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain('Host: Agent A');
      expect(errorMessages.textContent).toContain('Canceled by action id: cancel-id-abc');
      expect(errorMessages.textContent).toContain('Scan stopped on A');
      expect(errorMessages.textContent).toContain('Host: Agent B');
      expect(errorMessages.textContent).toContain('Canceled manually on the host');
      expect(errorMessages.textContent).toContain('Scan stopped on B');
    });
  });

  describe('when agentId prop is provided', () => {
    beforeEach(() => {
      action = {
        ...action,
        agents: ['agent-a', 'agent-b'],
        command: 'scan',
        isCompleted: true,
        wasSuccessful: false,
        hosts: {
          'agent-a': { name: 'Agent A' },
          'agent-b': { name: 'Agent B' },
        },
        errors: ['Error for A', 'Error for B'],
        agentState: {
          'agent-a': {
            isCompleted: true,
            wasSuccessful: false,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: ['Error for A'],
          },
          'agent-b': {
            isCompleted: true,
            wasSuccessful: true,
            wasCanceled: false,
            completedAt: new Date().toISOString(),
            errors: undefined,
          },
        },
        outputs: {
          'agent-a': {
            type: 'json',
            content: { code: 'ra_scan_error_queue-quota' },
          },
          'agent-b': {
            type: 'json',
            content: { code: 'ra_scan_success' },
          },
        },
      };
    });

    it('should render null when the specified agentId was successful', () => {
      renderResult = appTestContext.render(
        <EndpointActionFailureMessage
          action={action}
          agentId="agent-b"
          data-test-subj={testPrefix}
        />
      );
      expect(renderResult.queryByTestId(testId)).toBeNull();
    });

    it('should show only the errors for the specified agentId', () => {
      renderResult = appTestContext.render(
        <EndpointActionFailureMessage
          action={action}
          agentId="agent-a"
          data-test-subj={testPrefix}
        />
      );
      const errorMessages = renderResult.getByTestId(testId);
      expect(errorMessages).not.toBeNull();
      expect(errorMessages.textContent).toContain('Too many scans are queued');
      expect(errorMessages.textContent).toContain('Error for A');
      expect(errorMessages.textContent).not.toContain('Error for B');
      expect(errorMessages.textContent).not.toContain('Agent A');
      expect(errorMessages.textContent).not.toContain('Agent B');
    });
  });
});
