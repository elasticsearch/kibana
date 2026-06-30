/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { kibanaRequestFactory } from '@kbn/core-http-server-utils';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import { actionsConfigMock } from '@kbn/actions-plugin/server/actions_config.mock';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import { CasesConnector } from './cases_connector';
import { CasesConnectorExecutor } from './cases_connector_executor';
import {
  CASES_CONNECTOR_ID,
  MAX_OPEN_CASES_ADVANCED_SETTING,
  MAX_OPEN_CASES_DEFAULT_MAXIMUM,
} from '../../../common/constants';
import { CasesOracleService } from './cases_oracle_service';
import { CasesService } from './cases_service';
import { CasesConnectorError } from './cases_connector_error';
import { CaseError } from '../../common/error';
import { fullJitterBackoffFactory } from '@kbn/response-ops-retry-service';
import { getErrorSource } from '@kbn/task-manager-plugin/server/task_running';

jest.mock('./cases_connector_executor');
jest.mock('@kbn/response-ops-retry-service/full_jitter_backoff');

const CasesConnectorExecutorMock = CasesConnectorExecutor as jest.Mock;
const fullJitterBackoffFactoryMock = fullJitterBackoffFactory as jest.Mock;

describe('CasesConnector', () => {
  const services = actionsMock.createServices();
  const logger = loggingSystemMock.createLogger();
  const kibanaRequest = kibanaRequestFactory({ path: '/', headers: {} });

  const groupingBy = ['host.name', 'dest.ip'];
  const rule = {
    id: 'rule-test-id',
    name: 'Test rule',
    tags: ['rule', 'test'],
    ruleUrl: 'https://example.com/rules/rule-test-id',
  };
  const groupedAlerts = null;
  const internallyManagedAlerts = false;

  const owner = 'cases';
  const timeWindow = '7d';
  const reopenClosedCases = false;
  const maximumCasesToOpen = 5;
  const templateId = null;
  const templateVersion = null;
  const autoPushCase = null;

  const mockExecute = jest.fn();
  const getCasesClient = jest.fn().mockResolvedValue({ foo: 'bar' });
  const getSpaceId = jest.fn().mockReturnValue('default');
  const getUnsecuredSavedObjectsClient = jest.fn();
  const mockUiSettingsGet = jest.fn().mockResolvedValue(20);
  const getUiSettingsClient = jest.fn().mockResolvedValue({
    get: mockUiSettingsGet,
  });
  // 1ms delay before retrying
  const nextBackOff = jest.fn().mockReturnValue(1);

  const backOffFactory = {
    create: () => ({ nextBackOff }),
  };

  const casesParams = {
    getCasesClient,
    getSpaceId,
    getUnsecuredSavedObjectsClient,
    getUiSettingsClient,
    isCasesAttachmentsEnabled: false,
  };
  const connectorParams = {
    configurationUtilities: actionsConfigMock.create(),
    config: {},
    secrets: {},
    connector: { id: '1', type: CASES_CONNECTOR_ID },
    logger,
    services,
    request: kibanaRequest,
  };

  let connector: CasesConnector;

  let caughtError: CasesConnectorError;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecute.mockResolvedValue({});
    mockUiSettingsGet.mockResolvedValue(20);

    CasesConnectorExecutorMock.mockImplementation(() => {
      return {
        execute: mockExecute,
      };
    });

    fullJitterBackoffFactoryMock.mockReturnValue(backOffFactory);

    connector = new CasesConnector({
      casesParams,
      connectorParams,
    });
  });

  it('creates the CasesConnectorExecutor correctly', async () => {
    await connector.run({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(CasesConnectorExecutorMock).toBeCalledWith({
      logger,
      casesClient: { foo: 'bar' },
      casesOracleService: expect.any(CasesOracleService),
      casesService: expect.any(CasesService),
      spaceId: 'default',
      isCasesAttachmentsEnabled: false,
    });
  });

  it('executes the CasesConnectorExecutor correctly', async () => {
    await connector.run({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(mockExecute).toBeCalledWith({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });
  });

  it('reads the configured maximum from ui settings', async () => {
    await connector.run({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(mockUiSettingsGet).toHaveBeenCalledWith(MAX_OPEN_CASES_ADVANCED_SETTING);
  });

  it('throws when maximumCasesToOpen exceeds the configured maximum', async () => {
    mockUiSettingsGet.mockResolvedValue(10);

    await expect(() =>
      connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen: 11,
        templateId,
        templateVersion,
        autoPushCase,
      })
    ).rejects.toMatchObject({
      message: 'Maximum cases to open must be between 1 and 10.',
    });
  });

  it('overrides maximumCasesToOpen to MAX_OPEN_CASES_DEFAULT_MAXIMUM for internally managed alerts, regardless of the setting', async () => {
    mockUiSettingsGet.mockResolvedValue(500);

    await connector.run({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts: [
        {
          alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
          grouping: { attack_discovery: 'attack-discovery-id' },
        },
      ],
      groupingBy: [],
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts: true,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(mockExecute).toBeCalledWith(
      expect.objectContaining({
        internallyManagedAlerts: true,
        maximumCasesToOpen: MAX_OPEN_CASES_DEFAULT_MAXIMUM,
      })
    );
  });

  it('throws when maximumCasesToOpen exceeds a lowered configured maximum', async () => {
    mockUiSettingsGet.mockResolvedValue(5);

    await expect(() =>
      connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen: 10,
        templateId,
        templateVersion,
        autoPushCase,
      })
    ).rejects.toMatchObject({
      message: 'Maximum cases to open must be between 1 and 5.',
    });
  });

  it('creates the cases client correctly', async () => {
    await connector.run({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(getCasesClient).toBeCalled();
  });

  it('throws the same error if the executor throws a CasesConnectorError error', async () => {
    mockExecute.mockRejectedValue(new CasesConnectorError('Bad request', 400));
    try {
      await connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen,
        templateId,
        templateVersion,
        autoPushCase,
      });
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError.message).toBe('Bad request');

    expect(getErrorSource(caughtError)).toBe('user');
    expect(logger.error.mock.calls[0][0]).toBe(
      '[CasesConnector][run] Execution of case connector failed. Message: Bad request. Status code: 400'
    );
  });

  it('throws a CasesConnectorError when the executor throws an CaseError error', async () => {
    mockExecute.mockRejectedValue(new CaseError('Forbidden'));

    try {
      await connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen,
        templateId,
        templateVersion,
        autoPushCase,
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError.message).toBe('Forbidden');
    expect(getErrorSource(caughtError)).not.toBe('user');
    expect(logger.error.mock.calls[0][0]).toBe(
      '[CasesConnector][run] Execution of case connector failed. Message: Forbidden. Status code: 500'
    );
  });

  it('throws a CasesConnectorError when the executor throws an Error', async () => {
    mockExecute.mockRejectedValue(new Error('Server error'));

    await expect(() =>
      connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen,
        templateId,
        templateVersion,
        autoPushCase,
      })
    ).rejects.toThrowErrorMatchingInlineSnapshot(`"Server error"`);

    expect(logger.error.mock.calls[0][0]).toBe(
      '[CasesConnector][run] Execution of case connector failed. Message: Server error. Status code: 500'
    );
  });

  it('throws a CasesConnectorError when the executor throws a Boom error', async () => {
    mockExecute.mockRejectedValue(
      new Boom.Boom('Server error', { statusCode: 403, message: 'my error message' })
    );

    try {
      await connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen,
        templateId,
        templateVersion,
        autoPushCase,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError.message).toBe('Forbidden: Server error');
    expect(getErrorSource(caughtError)).toBe('user');

    expect(logger.error.mock.calls[0][0]).toBe(
      '[CasesConnector][run] Execution of case connector failed. Message: Forbidden: Server error. Status code: 403'
    );
  });

  it('retries correctly', async () => {
    mockExecute
      .mockRejectedValueOnce(new CasesConnectorError('Conflict error', 409))
      .mockRejectedValueOnce(new CasesConnectorError('ES Unavailable', 503))
      .mockResolvedValue({});

    await connector.run({
      alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(nextBackOff).toBeCalledTimes(2);
    expect(mockExecute).toBeCalledTimes(3);
  });

  it('throws if the kibana request is not defined', async () => {
    connector = new CasesConnector({
      casesParams,
      connectorParams: { ...connectorParams, request: undefined },
    });
    try {
      await connector.run({
        alerts: [{ _id: 'alert-id-0', _index: 'alert-index-0' }],
        groupedAlerts,
        groupingBy,
        owner,
        rule,
        timeWindow,
        internallyManagedAlerts,
        reopenClosedCases,
        maximumCasesToOpen,
        templateId,
        templateVersion,
        autoPushCase,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError.message).toBe('Kibana request is not defined');
    expect(getErrorSource(caughtError)).toBe('user');

    expect(logger.error.mock.calls[0][0]).toBe(
      '[CasesConnector][run] Execution of case connector failed. Message: Kibana request is not defined. Status code: 400'
    );

    expect(nextBackOff).toBeCalledTimes(0);
    expect(mockExecute).toBeCalledTimes(0);
  });

  it('does not execute with no alerts', async () => {
    await connector.run({
      alerts: [],
      groupedAlerts,
      groupingBy,
      owner,
      rule,
      timeWindow,
      internallyManagedAlerts,
      reopenClosedCases,
      maximumCasesToOpen,
      templateId,
      templateVersion,
      autoPushCase,
    });

    expect(getCasesClient).not.toBeCalled();
    expect(CasesConnectorExecutorMock).not.toBeCalled();
    expect(mockExecute).not.toBeCalled();
    expect(nextBackOff).not.toBeCalled();
  });
});
