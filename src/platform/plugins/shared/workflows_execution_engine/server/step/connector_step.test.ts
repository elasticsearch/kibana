/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ConnectorStepImpl } from './connector_step';

const createMocks = () => {
  const stepExecutionRuntime = {
    contextManager: {
      renderValueAccordingToContext: jest.fn((v: unknown) => v),
    },
    abortController: new AbortController(),
    node: { configuration: {} },
    startStep: jest.fn(),
    flushEventLogs: jest.fn().mockResolvedValue(undefined),
    finishStep: jest.fn(),
    failStep: jest.fn(),
    setInput: jest.fn(),
    stepExecutionId: 'step-exec-1',
    workflowExecution: { workflowDefinition: {} },
  };

  const connectorExecutor = {
    execute: jest.fn(),
    executeSystemConnector: jest.fn(),
  };

  const workflowRuntime = {
    navigateToNextNode: jest.fn(),
  };

  const workflowLogger = {
    logInfo: jest.fn(),
    logError: jest.fn(),
    logDebug: jest.fn(),
    logWarn: jest.fn(),
  };

  return { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger };
};

describe('ConnectorStepImpl', () => {
  it('returns console log output for console step type', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    const step = {
      name: 'log-step',
      stepId: 'log-step',
      type: 'console',
      with: { message: 'hello world' },
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({ message: 'hello world' });
    expect(result.output).toBe('hello world');
    expect(result.error).toBeUndefined();
    expect(workflowLogger.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('hello world'),
      expect.any(Object)
    );
  });

  it('executes a regular connector with connector-id', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: { result: 'success' },
    });

    const step = {
      name: 'my-connector',
      stepId: 'my-connector',
      type: 'slack',
      'connector-id': 'conn-123',
      with: { text: 'hi' },
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({ text: 'hi' });
    expect(result.output).toEqual({ result: 'success' });
    expect(connectorExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorType: 'slack',
        connectorNameOrId: 'conn-123',
      })
    );
  });

  it('forwards email attachment inputs unchanged to the connector executor', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();
    const attachments = [
      {
        filename: 'report.csv',
        contentType: 'text/csv',
        content: 'host,risk\nhost-1,high\n',
      },
    ];

    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: undefined,
    });

    const withInputs = {
      to: ['ops@example.com'],
      subject: 'Daily CSV report',
      message: 'Attached is the generated report.',
      attachments,
    };

    const step = {
      name: 'send-report',
      stepId: 'send-report',
      type: 'email',
      'connector-id': 'stakeholder-email',
      with: withInputs,
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run(withInputs);

    expect(result.error).toBeUndefined();
    expect(connectorExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorType: 'email',
        connectorNameOrId: 'stakeholder-email',
        input: withInputs,
      })
    );
  });

  it('executes a regular connector with a rendered connector-id', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    stepExecutionRuntime.contextManager.renderValueAccordingToContext.mockImplementation((value) =>
      value === '{{ inputs.connector_id }}' ? 'conn-456' : value
    );
    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: { result: 'success' },
    });

    const step = {
      name: 'my-connector',
      stepId: 'my-connector',
      type: 'slack',
      'connector-id': '{{ inputs.connector_id }}',
      with: { text: 'hi' },
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({ text: 'hi' });
    expect(result.output).toEqual({ result: 'success' });
    expect(stepExecutionRuntime.contextManager.renderValueAccordingToContext).toHaveBeenCalledWith(
      '{{ inputs.connector_id }}'
    );
    expect(connectorExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorType: 'slack',
        connectorNameOrId: 'conn-456',
      })
    );
  });

  it('handles connector error status', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'error',
      message: 'connector failed',
      serviceMessage: null,
    });

    const step = {
      name: 'my-connector',
      stepId: 'my-connector',
      type: 'slack',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error).toBeDefined();
    expect(result.error.message).toBe('connector failed');
  });

  it('returns ResponseSizeLimitError when maxContentLength exceeded', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'error',
      message: null,
      serviceMessage: 'maxContentLength size of 10485760 exceeded',
    });

    const step = {
      name: 'http-step',
      stepId: 'http-step',
      type: 'http',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error.type).toBe('StepSizeLimitExceeded');
  });

  it('returns ActionsResponseContentLengthLimitError for spec connector maxContentLength failures without explicit max-step-size', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'error',
      message: null,
      serviceMessage: 'maxContentLength size of 1048576 exceeded',
      errorMeta: {
        contentLengthBytes: 10 * 1024 * 1024,
        estimatedOutputBytes: 14 * 1024 * 1024,
      },
    });

    const step = {
      name: 'download_file',
      stepId: 'download_file',
      type: 'google_drive.downloadFile',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error.type).toBe('ActionsResponseContentLengthExceeded');
    expect(result.error.message).toContain('current Actions HTTP response limit');
    expect(result.error.message).toContain('10 MB');
    expect(result.error.message).toContain("Set 'max-step-size' to at least 14 MB on this step");
    expect(result.error.message).toContain('to raise both the workflow output limit');
    expect(result.error.message).not.toContain(
      'Increasing "max-step-size" will not change this limit'
    );
    expect(result.error.details).toEqual({
      configKey: 'xpack.actions.maxResponseContentLength',
      limitBytes: 1024 * 1024,
      contentLengthBytes: 10 * 1024 * 1024,
      estimatedOutputBytes: 14 * 1024 * 1024,
      suggestedLimitBytes: 14 * 1024 * 1024,
    });
  });

  it('suggests max-step-size for spec connector maxContentLength failures without content-length', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'error',
      message: null,
      serviceMessage: 'maxContentLength size of 1048576 exceeded',
    });

    const step = {
      name: 'download_file',
      stepId: 'download_file',
      type: 'google_drive.downloadFile',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error.type).toBe('ActionsResponseContentLengthExceeded');
    expect(result.error.message).toContain("Set a larger 'max-step-size' on this step");
    expect(result.error.message).toContain('to raise both the workflow output limit');
    expect(result.error.message).not.toContain(
      'Increasing "max-step-size" will not change this limit'
    );
    expect(result.error.details).toEqual({
      configKey: 'xpack.actions.maxResponseContentLength',
      limitBytes: 1024 * 1024,
    });
  });

  it('returns StepSizeLimitExceeded for spec connector maxContentLength failures with explicit max-step-size', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'error',
      message: null,
      serviceMessage: 'maxContentLength size of 1048576 exceeded',
      errorMeta: {
        contentLengthBytes: 10 * 1024 * 1024,
        estimatedOutputBytes: 14 * 1024 * 1024,
      },
    });

    const step = {
      name: 'download_file',
      stepId: 'download_file',
      type: 'google_drive.downloadFile',
      'connector-id': 'conn-123',
      'max-step-size': '1mb',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error.type).toBe('StepSizeLimitExceeded');
    expect(result.error.message).toContain('10 MB');
    expect(result.error.message).toContain("Set 'max-step-size' to at least 14 MB");
    expect(result.error.details).toEqual({
      limitBytes: 1024 * 1024,
      contentLengthBytes: 10 * 1024 * 1024,
      estimatedOutputBytes: 14 * 1024 * 1024,
      suggestedLimitBytes: 14 * 1024 * 1024,
    });
  });

  it('returns ActionsResponseContentLengthLimitError for non-layer-1 connector maxContentLength failures', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'error',
      message: null,
      serviceMessage: 'maxContentLength size of 1048576 exceeded',
      errorMeta: { contentLengthBytes: 10 * 1024 * 1024 },
    });

    const step = {
      name: 'jira-step',
      stepId: 'jira-step',
      type: 'jira.getFields',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error.type).toBe('ActionsResponseContentLengthExceeded');
    expect(result.error.message).toContain('xpack.actions.maxResponseContentLength');
    expect(result.error.message).toContain('max-step-size');
    expect(result.error.details).toEqual({
      configKey: 'xpack.actions.maxResponseContentLength',
      limitBytes: 1048576,
      contentLengthBytes: 10 * 1024 * 1024,
      suggestedLimitBytes: 10 * 1024 * 1024,
    });
  });

  it('throws when connectorExecutor is undefined', async () => {
    const { stepExecutionRuntime, workflowRuntime, workflowLogger } = createMocks();

    const step = {
      name: 'my-connector',
      stepId: 'my-connector',
      type: 'slack',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      undefined as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});
    expect(result.error).toBeDefined();
    expect(result.error.message).toContain('Connector executor is not set');
  });

  it('handles sub-action connector steps', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: { items: [] },
    });

    const step = {
      name: 'jira-step',
      stepId: 'jira-step',
      type: 'jira.getFields',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({ project: 'TEST' });
    expect(result.output).toEqual({ items: [] });
    expect(connectorExecutor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorType: 'jira',
        input: expect.objectContaining({
          subAction: 'getFields',
          subActionParams: { project: 'TEST' },
        }),
      })
    );
    expect(connectorExecutor.execute.mock.calls[0][0].input.fetchOptions).toBeUndefined();
  });

  it('injects max_content_length for spec connector sub-actions', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: { response: 'ok' },
    });

    const step = {
      name: 'download_file',
      stepId: 'download_file',
      type: 'google_drive.downloadFile',
      'connector-id': 'conn-123',
      'max-step-size': '20mb',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await (impl as any)._run({ fileId: 'file-1' });
    const callInput = connectorExecutor.execute.mock.calls[0][0].input;
    expect(callInput).toEqual({
      subAction: 'downloadFile',
      subActionParams: { fileId: 'file-1' },
      fetchOptions: {
        max_content_length: 20 * 1024 * 1024,
      },
    });
  });

  it('does not inject default max_content_length for spec connector sub-actions', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: { response: 'ok' },
    });

    const step = {
      name: 'download_file',
      stepId: 'download_file',
      type: 'google_drive.downloadFile',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await (impl as any)._run({ fileId: 'file-1' });
    const callInput = connectorExecutor.execute.mock.calls[0][0].input;
    expect(callInput).toEqual({
      subAction: 'downloadFile',
      subActionParams: { fileId: 'file-1' },
    });
  });

  it('uses system connector when no connector-id is provided', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.executeSystemConnector.mockResolvedValue({
      status: 'ok',
      data: { response: 'ok' },
    });

    const step = {
      name: 'http-step',
      stepId: 'http-step',
      type: 'http',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    const result = await (impl as any)._run({});

    expect(connectorExecutor.executeSystemConnector).toHaveBeenCalledWith(
      expect.objectContaining({
        connectorType: '.http-system',
        input: expect.objectContaining({
          fetcher: expect.objectContaining({
            max_content_length: expect.any(Number),
          }),
        }),
      })
    );
    expect(result).toEqual({
      input: {},
      output: { response: 'ok' },
      error: undefined,
    });
  });

  it('injects max_content_length for http connector type', async () => {
    const { stepExecutionRuntime, connectorExecutor, workflowRuntime, workflowLogger } =
      createMocks();

    connectorExecutor.execute.mockResolvedValue({
      status: 'ok',
      data: { response: 'ok' },
    });

    const step = {
      name: 'http-step',
      stepId: 'http-step',
      type: 'http',
      'connector-id': 'conn-123',
    };

    const impl = new ConnectorStepImpl(
      step,
      stepExecutionRuntime as any,
      connectorExecutor as any,
      workflowRuntime as any,
      workflowLogger as any
    );

    await (impl as any)._run({ url: 'https://example.com' });
    const callInput = connectorExecutor.execute.mock.calls[0][0].input;
    expect(callInput.fetcher).toBeDefined();
    expect(callInput.fetcher.max_content_length).toBeGreaterThan(0);
  });
});
