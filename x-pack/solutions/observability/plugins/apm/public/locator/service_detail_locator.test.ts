/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { Environment } from '../../common/environment_rt';
import type { IUiSettingsClient } from '@kbn/core/public';
import { APMServiceDetailLocator, APM_APP_LOCATOR_ID } from './service_detail_locator';
import {
  enableComparisonByDefault,
  defaultApmServiceEnvironment,
} from '@kbn/observability-plugin/common';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import { ENVIRONMENT_ALL } from '../../common/environment_filter_values';

describe('APMLocatorDefinition', () => {
  let locator: APMServiceDetailLocator;

  beforeEach(() => {
    const uiSettingsMock = {
      get: (key: string) => {
        if (key === enableComparisonByDefault) {
          return false;
        }
        if (key === defaultApmServiceEnvironment) {
          return ENVIRONMENT_ALL.value;
        }
        if (key === UI_SETTINGS.TIMEPICKER_TIME_DEFAULTS) {
          return { from: 'now-15m', to: 'now' };
        }
      },
    } as unknown as IUiSettingsClient;

    locator = new APMServiceDetailLocator(uiSettingsMock);
  });

  it('locator has the right ID and app', async () => {
    const location = await locator.getLocation({
      serviceName: 'test-app',
      query: { environment: 'ENVIRONMENT_ALL' },
    });

    expect(locator.id).toBe(APM_APP_LOCATOR_ID);
    expect(location).toMatchObject({
      app: 'apm',
    });
  });

  it('should return the right link when given a serviceName', async () => {
    const location = await locator.getLocation({
      serviceName: 'example-app',
      query: {
        environment: 'development' as Environment,
      },
    });

    expect(location.path).toBe(
      '/services/example-app/overview?anomalyThreshold=major&comparisonEnabled=false&environment=development&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup='
    );
  });

  it('should return a link to the service inventory page when not given a service name', async () => {
    const location = await locator.getLocation({ serviceName: undefined });

    expect(location.path).toBe(
      '/services?comparisonEnabled=false&environment=ENVIRONMENT_ALL&kuery=&rangeFrom=now-15m&rangeTo=now&serviceGroup='
    );
  });

  it('should return the right link when given a specific service tab', async () => {
    const location = await locator.getLocation({
      serviceName: 'example-app',
      serviceOverviewTab: 'traces',
      query: {
        environment: 'prod' as Environment,
      },
    });

    expect(location.path).toBe(
      '/services/example-app/transactions?anomalyThreshold=major&comparisonEnabled=false&environment=prod&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup='
    );
  });

  it('should deeplink to the error group details page when errorGroupId is provided', async () => {
    const location = await locator.getLocation({
      serviceName: 'example-app',
      serviceOverviewTab: 'errors',
      errorGroupId: 'group-1',
      query: {
        environment: 'prod' as Environment,
      },
    });

    expect(location.path).toBe(
      '/services/example-app/errors/group-1?anomalyThreshold=major&comparisonEnabled=false&environment=prod&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup='
    );
  });

  it('should fall back to the errors tab when errorGroupId is not provided', async () => {
    const location = await locator.getLocation({
      serviceName: 'example-app',
      serviceOverviewTab: 'errors',
      query: {
        environment: 'prod' as Environment,
      },
    });

    expect(location.path).toBe(
      '/services/example-app/errors?anomalyThreshold=major&comparisonEnabled=false&environment=prod&kuery=&latencyAggregationType=avg&rangeFrom=now-15m&rangeTo=now&serviceGroup='
    );
  });
});
