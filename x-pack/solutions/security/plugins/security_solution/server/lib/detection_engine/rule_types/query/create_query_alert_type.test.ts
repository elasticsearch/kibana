/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { allowedExperimentalValues } from '../../../../../common/experimental_features';
import { createQueryAlertType } from './create_query_alert_type';
import { createRuleTypeMocks } from '../__mocks__/rule_type';
import { createSecurityRuleTypeWrapper } from '../create_security_rule_type_wrapper';
import { createMockConfig } from '../../routes/__mocks__';
import { createMockTelemetryEventsSender } from '../../../telemetry/__mocks__';
import { ruleExecutionLogMock } from '../../rule_monitoring/mocks';
import { sampleDocNoSortId } from '../__mocks__/es_results';
import { getQueryRuleParams } from '../../rule_schema/mocks';
import { licensingMock } from '@kbn/licensing-plugin/server/mocks';
import { QUERY_RULE_TYPE_ID } from '@kbn/securitysolution-rules';
import { docLinksServiceMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { IndexPatternsFetcher } from '@kbn/data-views-plugin/server';
import { hasTimestampFields } from '../utils/utils';
import { createMockEndpointAppContextService } from '../../../../endpoint/mocks';

jest.mock('@kbn/data-views-plugin/server', () => ({
  ...jest.requireActual('@kbn/data-views-plugin/server'),
  IndexPatternsFetcher: jest.fn().mockImplementation(() => ({
    getIndexPatternMatches: jest.fn().mockResolvedValue({ matchedIndexPatterns: ['some-index'] }),
  })),
}));

jest.mock('../utils/utils', () => ({
  ...jest.requireActual('../utils/utils'),
  getExceptions: () => [],
  hasTimestampFields: jest.fn(async () => {
    return {
      foundNoIndices: false,
      warningMessage: undefined,
    };
  }),
  checkForFrozenIndices: jest.fn(async () => []),
}));

jest.mock('@kbn/alerting-plugin/server', () => ({
  ...jest.requireActual('@kbn/alerting-plugin/server'),
  shouldCreateAlertsInAllSpaces: jest.fn().mockReturnValue(false),
}));

jest.mock('../utils/get_list_client', () => ({
  getListClient: jest.fn().mockReturnValue({
    listClient: jest.fn(),
    exceptionsClient: jest.fn(),
  }),
}));

describe('Custom Query Alerts', () => {
  const mocks = createRuleTypeMocks();
  const licensing = licensingMock.createSetup();
  const docLinks = docLinksServiceMock.createSetupContract();
  const publicBaseUrl = 'http://somekibanabaseurl.com';
  const mockedStatusLogger = ruleExecutionLogMock.forExecutors.create();
  const ruleStatusLogger = () => Promise.resolve(mockedStatusLogger);

  const { dependencies, executor, services } = mocks;
  const { actions, alerting, lists, logger, ruleDataClient } = dependencies;

  const eventsTelemetry = createMockTelemetryEventsSender(true);

  const wrapperOptions = {
    actions,
    docLinks,
    lists,
    logger,
    config: createMockConfig(),
    ruleDataClient,
    ruleExecutionLoggerFactory: ruleStatusLogger,
    version: '8.3',
    experimentalFeatures: allowedExperimentalValues,
    publicBaseUrl,
    alerting,
    eventsTelemetry,
    licensing,
    scheduleNotificationResponseActionsService: () => null,
    endpointAppContextService: createMockEndpointAppContextService(),
    getEntityStore: jest.fn().mockResolvedValue({
      createCRUDClient: jest.fn().mockReturnValue({ listEntities: jest.fn() }),
    }),
    getRulesAuthz: jest.fn().mockResolvedValue({}),
  };

  const securityRuleTypeWrapper = createSecurityRuleTypeWrapper(wrapperOptions);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('does not send an alert when no events found', async () => {
    const queryAlertType = securityRuleTypeWrapper(
      createQueryAlertType({
        id: QUERY_RULE_TYPE_ID,
        name: 'Custom Query Rule',
      })
    );

    alerting.registerType(queryAlertType);

    services.scopedClusterClient.asCurrentUser.search.mockResolvedValue({
      hits: {
        hits: [],
        total: {
          relation: 'eq',
          value: 0,
        },
      },
      took: 0,
      timed_out: false,
      _shards: {
        failed: 0,
        skipped: 0,
        successful: 1,
        total: 1,
      },
    });

    const params = getQueryRuleParams();

    await executor({
      params,
    });

    expect((await ruleDataClient.getWriter()).bulk).not.toHaveBeenCalled();
    expect(eventsTelemetry.queueTelemetryEvents).not.toHaveBeenCalled();
  });

  it('short-circuits and writes a warning if no indices are found', async () => {
    (IndexPatternsFetcher as jest.Mock).mockImplementationOnce(() => ({
      getIndexPatternMatches: jest.fn().mockResolvedValue({ matchedIndexPatterns: [] }),
    }));
    const queryAlertType = securityRuleTypeWrapper(
      createQueryAlertType({
        id: QUERY_RULE_TYPE_ID,
        name: 'Custom Query Rule',
      })
    );

    alerting.registerType(queryAlertType);

    services.scopedClusterClient.asCurrentUser.search.mockResolvedValue({
      hits: {
        hits: [sampleDocNoSortId()],
        total: {
          relation: 'eq',
          value: 1,
        },
      },
      took: 0,
      timed_out: false,
      _shards: {
        failed: 0,
        skipped: 0,
        successful: 1,
        total: 1,
      },
    });

    const params = getQueryRuleParams();

    await executor({ params });

    expect((await ruleDataClient.getWriter()).bulk).not.toHaveBeenCalled();
    expect(eventsTelemetry.sendAsync).not.toHaveBeenCalled();
    expect(mockedStatusLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        'Unable to find matching indices for rule ALERT_RULE_NAME. This warning will persist until one of the following occurs: a matching index is created or the rule is disabled.'
      )
    );
  });

  it('sends an alert when events are found', async () => {
    const queryAlertType = securityRuleTypeWrapper(
      createQueryAlertType({
        id: QUERY_RULE_TYPE_ID,
        name: 'Custom Query Rule',
      })
    );

    alerting.registerType(queryAlertType);

    const params = getQueryRuleParams();

    services.scopedClusterClient.asCurrentUser.search.mockResolvedValue({
      hits: {
        hits: [sampleDocNoSortId()],
        total: {
          relation: 'eq',
          value: 1,
        },
      },
      took: 0,
      timed_out: false,
      _shards: {
        failed: 0,
        skipped: 0,
        successful: 1,
        total: 1,
      },
    });

    await executor({ params });

    expect((await ruleDataClient.getWriter()).bulk).toHaveBeenCalled();
    expect(eventsTelemetry.sendAsync).toHaveBeenCalled();
  });

  it('classifies gap errors as user errors', async () => {
    const queryAlertType = securityRuleTypeWrapper(
      createQueryAlertType({
        id: QUERY_RULE_TYPE_ID,
        name: 'Custom Query Rule',
      })
    );

    alerting.registerType(queryAlertType);

    services.scopedClusterClient.asCurrentUser.search.mockResolvedValue({
      hits: {
        hits: [],
        total: { relation: 'eq', value: 0 },
      },
      took: 0,
      timed_out: false,
      _shards: { failed: 0, skipped: 0, successful: 1, total: 1 },
    });

    const params = getQueryRuleParams();

    await executor({
      params,
      previousStartedAt: new Date(Date.now() - 60 * 60 * 1000),
    });

    expect(mockedStatusLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'were not queried between this rule execution and the last execution'
      ),
      expect.objectContaining({ userError: true })
    );
  });

  it('sends an alert when events are found and logs a warning when hasTimestampFields throws an error', async () => {
    (hasTimestampFields as jest.Mock).mockImplementationOnce(async () => {
      throw Error('hastTimestampFields test error');
    });

    services.scopedClusterClient.asCurrentUser.fieldCaps.mockResolvedValue({
      indices: ['some-index'],
      fields: {},
      // @ts-expect-error body does not exist on FieldCapsResponse but is needed for TransportResult shape used by hasTimestampFields
      body: { indices: ['some-index'], fields: {} },
    });

    const queryAlertType = securityRuleTypeWrapper(
      createQueryAlertType({
        id: QUERY_RULE_TYPE_ID,
        name: 'Custom Query Rule',
      })
    );

    alerting.registerType(queryAlertType);

    services.scopedClusterClient.asCurrentUser.search.mockResolvedValue({
      hits: {
        hits: [sampleDocNoSortId()],
        total: {
          relation: 'eq',
          value: 1,
        },
      },
      took: 0,
      timed_out: false,
      _shards: {
        failed: 0,
        skipped: 0,
        successful: 1,
        total: 1,
      },
    });

    const params = getQueryRuleParams();

    await executor({ params });

    expect((await ruleDataClient.getWriter()).bulk).toHaveBeenCalled();
    expect(eventsTelemetry.sendAsync).toHaveBeenCalled();
    expect(mockedStatusLogger.warn).toHaveBeenCalledWith(
      'Timestamp fields check failed to execute Error: hastTimestampFields test error'
    );
    expect(mockedStatusLogger.warn).toHaveBeenCalledWith(
      "The rule's max alerts per run setting (10000) is greater than the Kibana alerting limit (1000). The rule will only write a maximum of 1000 alerts per rule run."
    );
  });

  describe('response actions', () => {
    const buildWrapper = (isPreview: boolean, scheduleService: jest.Mock) =>
      createSecurityRuleTypeWrapper({
        ...wrapperOptions,
        isPreview,
        scheduleNotificationResponseActionsService: scheduleService,
      });

    const runRule = async ({ isPreview }: { isPreview: boolean }) => {
      const scheduleService = jest.fn();
      const queryAlertType = buildWrapper(
        isPreview,
        scheduleService
      )(createQueryAlertType({ id: QUERY_RULE_TYPE_ID, name: 'Custom Query Rule' }));
      alerting.registerType(queryAlertType);

      services.scopedClusterClient.asCurrentUser.search.mockResolvedValue({
        hits: {
          hits: [sampleDocNoSortId()],
          total: { relation: 'eq', value: 1 },
        },
        took: 0,
        timed_out: false,
        _shards: { failed: 0, skipped: 0, successful: 1, total: 1 },
      });

      await executor({ params: getQueryRuleParams() });
      return scheduleService;
    };

    it('dispatches response actions on a normal rule run', async () => {
      const scheduleService = await runRule({ isPreview: false });
      expect(scheduleService).toHaveBeenCalled();
    });

    it('never dispatches response actions during preview', async () => {
      const scheduleService = await runRule({ isPreview: true });
      expect(scheduleService).not.toHaveBeenCalled();
    });
  });

  describe('when exiting early due to an error resolving the input index', () => {
    const dataViewId = 'missing-data-view-id';

    const registerAndRun = async () => {
      const queryAlertType = securityRuleTypeWrapper(
        createQueryAlertType({
          id: QUERY_RULE_TYPE_ID,
          name: 'Custom Query Rule',
        })
      );

      alerting.registerType(queryAlertType);

      await executor({ params: getQueryRuleParams({ dataViewId }) });
    };

    it('closes the rule execution logger when the data view is not found, so the last run object is updated', async () => {
      services.savedObjectsClient.get.mockRejectedValueOnce(
        SavedObjectsErrorHelpers.createGenericNotFoundError('index-pattern', dataViewId)
      );

      await registerAndRun();

      expect(mockedStatusLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Data view is not found.'),
        expect.objectContaining({ userError: true })
      );
      expect(mockedStatusLogger.close).toHaveBeenCalledTimes(1);
    });

    it('closes the rule execution logger when resolving the input index fails unexpectedly, so the last run object is updated', async () => {
      services.savedObjectsClient.get.mockRejectedValueOnce(new Error('Unexpected failure'));

      await registerAndRun();

      expect(mockedStatusLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Check for indices to search failed.')
      );
      expect(mockedStatusLogger.close).toHaveBeenCalledTimes(1);
    });
  });
});
