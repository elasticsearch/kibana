/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getAdminCapabilities, getUserCapabilities } from './__mocks__/ml_capabilities';
import {
  areCapabilitiesAllowedByLicenseAndFeatures,
  capabilitiesProvider,
  hasMlCapabilitiesProvider,
} from './check_capabilities';
import { InsufficientMLCapabilities } from './errors';
import type { MlLicense } from '../../../common/license';
import { getDefaultMlCapabilities } from '@kbn/ml-common-types/capabilities';
import type { MlClient } from '../ml_client';

const mlLicense = {
  isSecurityEnabled: () => true,
  isFullLicense: () => true,
} as MlLicense;

const mlLicenseBasic = {
  isSecurityEnabled: () => true,
  isFullLicense: () => false,
} as MlLicense;

const mlIsEnabled = async () => true;
const mlIsNotEnabled = async () => false;

const mlClientNonUpgrade = {
  info: async () => ({
    upgrade_mode: false,
  }),
} as unknown as MlClient;

const mlClientUpgrade = {
  info: async () => ({
    upgrade_mode: true,
  }),
} as unknown as MlClient;

describe('check_capabilities', () => {
  describe('getCapabilities() - right number of capabilities', () => {
    test('kibana capabilities count', async () => {
      const { getCapabilities } = capabilitiesProvider(
        mlClientNonUpgrade,
        getAdminCapabilities(),
        mlLicense,
        mlIsEnabled
      );
      const { capabilities } = await getCapabilities();
      const count = Object.keys(capabilities).length;
      expect(count).toBe(44);
    });
  });

  describe('getCapabilities() with security', () => {
    test('ml_user capabilities only', async () => {
      const { getCapabilities } = capabilitiesProvider(
        mlClientNonUpgrade,
        getUserCapabilities(),
        mlLicense,
        mlIsEnabled
      );
      const { capabilities, upgradeInProgress, mlFeatureEnabledInSpace, isPlatinumOrTrialLicense } =
        await getCapabilities();
      expect(upgradeInProgress).toBe(false);
      expect(mlFeatureEnabledInSpace).toBe(true);
      expect(isPlatinumOrTrialLicense).toBe(true);

      expect(capabilities.canGetFieldInfo).toBe(true);
      expect(capabilities.canGetMlInfo).toBe(true);
      expect(capabilities.canUseAiops).toBe(true);
      expect(capabilities.canGetJobs).toBe(true);
      expect(capabilities.canGetDatafeeds).toBe(true);
      expect(capabilities.canGetCalendars).toBe(true);
      expect(capabilities.canFindFileStructure).toBe(true);
      expect(capabilities.canGetDataFrameAnalytics).toBe(true);
      expect(capabilities.canGetAnnotations).toBe(true);
      expect(capabilities.canCreateAnnotation).toBe(true);
      expect(capabilities.canDeleteAnnotation).toBe(true);
      expect(capabilities.canUseMlAlerts).toBe(true);
      expect(capabilities.canGetTrainedModels).toBe(true);
      expect(capabilities.canTestTrainedModels).toBe(true);

      expect(capabilities.canCreateJob).toBe(false);
      expect(capabilities.canDeleteJob).toBe(false);
      expect(capabilities.canOpenJob).toBe(false);
      expect(capabilities.canCloseJob).toBe(false);
      expect(capabilities.canResetJob).toBe(false);
      expect(capabilities.canForecastJob).toBe(false);
      expect(capabilities.canDeleteForecast).toBe(false);
      expect(capabilities.canStartStopDatafeed).toBe(false);
      expect(capabilities.canUpdateJob).toBe(false);
      expect(capabilities.canCreateDatafeed).toBe(false);
      expect(capabilities.canDeleteDatafeed).toBe(false);
      expect(capabilities.canUpdateDatafeed).toBe(false);
      expect(capabilities.canPreviewDatafeed).toBe(false);
      expect(capabilities.canGetFilters).toBe(false);
      expect(capabilities.canCreateCalendar).toBe(false);
      expect(capabilities.canDeleteCalendar).toBe(false);
      expect(capabilities.canCreateFilter).toBe(false);
      expect(capabilities.canDeleteFilter).toBe(false);
      expect(capabilities.canDeleteDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateDataFrameAnalytics).toBe(false);
      expect(capabilities.canStartStopDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateMlAlerts).toBe(false);
      expect(capabilities.canViewMlNodes).toBe(false);
      expect(capabilities.canCreateTrainedModels).toBe(false);
      expect(capabilities.canCreateInferenceEndpoint).toBe(false);
      expect(capabilities.canDeleteTrainedModels).toBe(false);
      expect(capabilities.canStartStopTrainedModels).toBe(false);

      expect(capabilities.isADEnabled).toBe(true);
      expect(capabilities.isDFAEnabled).toBe(true);
      expect(capabilities.isNLPEnabled).toBe(true);
    });

    test('full capabilities', async () => {
      const { getCapabilities } = capabilitiesProvider(
        mlClientNonUpgrade,
        getAdminCapabilities(),
        mlLicense,
        mlIsEnabled
      );
      const { capabilities, upgradeInProgress, mlFeatureEnabledInSpace, isPlatinumOrTrialLicense } =
        await getCapabilities();
      expect(upgradeInProgress).toBe(false);
      expect(mlFeatureEnabledInSpace).toBe(true);
      expect(isPlatinumOrTrialLicense).toBe(true);

      expect(capabilities.canGetFieldInfo).toBe(true);
      expect(capabilities.canGetMlInfo).toBe(true);
      expect(capabilities.canUseAiops).toBe(true);
      expect(capabilities.canGetJobs).toBe(true);
      expect(capabilities.canGetDatafeeds).toBe(true);
      expect(capabilities.canGetCalendars).toBe(true);
      expect(capabilities.canFindFileStructure).toBe(true);
      expect(capabilities.canGetDataFrameAnalytics).toBe(true);
      expect(capabilities.canGetAnnotations).toBe(true);
      expect(capabilities.canCreateAnnotation).toBe(true);
      expect(capabilities.canDeleteAnnotation).toBe(true);
      expect(capabilities.canUseMlAlerts).toBe(true);
      expect(capabilities.canGetTrainedModels).toBe(true);
      expect(capabilities.canTestTrainedModels).toBe(true);

      expect(capabilities.canCreateJob).toBe(true);
      expect(capabilities.canDeleteJob).toBe(true);
      expect(capabilities.canOpenJob).toBe(true);
      expect(capabilities.canCloseJob).toBe(true);
      expect(capabilities.canResetJob).toBe(true);
      expect(capabilities.canForecastJob).toBe(true);
      expect(capabilities.canDeleteForecast).toBe(true);
      expect(capabilities.canStartStopDatafeed).toBe(true);
      expect(capabilities.canUpdateJob).toBe(true);
      expect(capabilities.canCreateDatafeed).toBe(true);
      expect(capabilities.canDeleteDatafeed).toBe(true);
      expect(capabilities.canUpdateDatafeed).toBe(true);
      expect(capabilities.canPreviewDatafeed).toBe(true);
      expect(capabilities.canGetFilters).toBe(true);
      expect(capabilities.canCreateCalendar).toBe(true);
      expect(capabilities.canDeleteCalendar).toBe(true);
      expect(capabilities.canCreateFilter).toBe(true);
      expect(capabilities.canDeleteFilter).toBe(true);
      expect(capabilities.canDeleteDataFrameAnalytics).toBe(true);
      expect(capabilities.canCreateDataFrameAnalytics).toBe(true);
      expect(capabilities.canStartStopDataFrameAnalytics).toBe(true);
      expect(capabilities.canCreateMlAlerts).toBe(true);
      expect(capabilities.canViewMlNodes).toBe(true);
      expect(capabilities.canCreateTrainedModels).toBe(true);
      expect(capabilities.canCreateInferenceEndpoint).toBe(true);
      expect(capabilities.canDeleteTrainedModels).toBe(true);
      expect(capabilities.canStartStopTrainedModels).toBe(true);

      expect(capabilities.isADEnabled).toBe(true);
      expect(capabilities.isDFAEnabled).toBe(true);
      expect(capabilities.isNLPEnabled).toBe(true);
    });

    test('upgrade in progress with full capabilities', async () => {
      const { getCapabilities } = capabilitiesProvider(
        mlClientUpgrade,
        getAdminCapabilities(),
        mlLicense,
        mlIsEnabled
      );
      const { capabilities, upgradeInProgress, mlFeatureEnabledInSpace, isPlatinumOrTrialLicense } =
        await getCapabilities();
      expect(upgradeInProgress).toBe(true);
      expect(mlFeatureEnabledInSpace).toBe(true);
      expect(isPlatinumOrTrialLicense).toBe(true);

      expect(capabilities.canGetFieldInfo).toBe(true);
      expect(capabilities.canGetMlInfo).toBe(true);
      expect(capabilities.canUseAiops).toBe(true);
      expect(capabilities.canGetJobs).toBe(true);
      expect(capabilities.canGetDatafeeds).toBe(true);
      expect(capabilities.canGetCalendars).toBe(true);
      expect(capabilities.canFindFileStructure).toBe(true);
      expect(capabilities.canGetDataFrameAnalytics).toBe(true);
      expect(capabilities.canGetAnnotations).toBe(true);
      expect(capabilities.canCreateAnnotation).toBe(false);
      expect(capabilities.canDeleteAnnotation).toBe(false);
      expect(capabilities.canUseMlAlerts).toBe(false);
      expect(capabilities.canGetTrainedModels).toBe(true);
      expect(capabilities.canTestTrainedModels).toBe(true);

      expect(capabilities.canCreateJob).toBe(false);
      expect(capabilities.canDeleteJob).toBe(false);
      expect(capabilities.canOpenJob).toBe(false);
      expect(capabilities.canCloseJob).toBe(false);
      expect(capabilities.canResetJob).toBe(false);
      expect(capabilities.canForecastJob).toBe(false);
      expect(capabilities.canDeleteForecast).toBe(false);
      expect(capabilities.canStartStopDatafeed).toBe(false);
      expect(capabilities.canUpdateJob).toBe(false);
      expect(capabilities.canCreateDatafeed).toBe(false);
      expect(capabilities.canDeleteDatafeed).toBe(false);
      expect(capabilities.canGetFilters).toBe(false);
      expect(capabilities.canUpdateDatafeed).toBe(false);
      expect(capabilities.canPreviewDatafeed).toBe(false);
      expect(capabilities.canCreateCalendar).toBe(false);
      expect(capabilities.canDeleteCalendar).toBe(false);
      expect(capabilities.canCreateFilter).toBe(false);
      expect(capabilities.canDeleteFilter).toBe(false);
      expect(capabilities.canDeleteDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateDataFrameAnalytics).toBe(false);
      expect(capabilities.canStartStopDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateMlAlerts).toBe(false);
      expect(capabilities.canViewMlNodes).toBe(false);
      expect(capabilities.canCreateTrainedModels).toBe(false);
      expect(capabilities.canCreateInferenceEndpoint).toBe(false);
      expect(capabilities.canDeleteTrainedModels).toBe(false);
      expect(capabilities.canStartStopTrainedModels).toBe(false);

      expect(capabilities.isADEnabled).toBe(true);
      expect(capabilities.isDFAEnabled).toBe(true);
      expect(capabilities.isNLPEnabled).toBe(true);
    });

    test('upgrade in progress with partial capabilities', async () => {
      const { getCapabilities } = capabilitiesProvider(
        mlClientUpgrade,
        getUserCapabilities(),
        mlLicense,
        mlIsEnabled
      );
      const { capabilities, upgradeInProgress, mlFeatureEnabledInSpace, isPlatinumOrTrialLicense } =
        await getCapabilities();
      expect(upgradeInProgress).toBe(true);
      expect(mlFeatureEnabledInSpace).toBe(true);
      expect(isPlatinumOrTrialLicense).toBe(true);

      expect(capabilities.canGetFieldInfo).toBe(true);
      expect(capabilities.canGetMlInfo).toBe(true);
      expect(capabilities.canUseAiops).toBe(true);
      expect(capabilities.canGetJobs).toBe(true);
      expect(capabilities.canGetDatafeeds).toBe(true);
      expect(capabilities.canGetCalendars).toBe(true);
      expect(capabilities.canFindFileStructure).toBe(true);
      expect(capabilities.canGetDataFrameAnalytics).toBe(true);
      expect(capabilities.canGetAnnotations).toBe(true);
      expect(capabilities.canCreateAnnotation).toBe(false);
      expect(capabilities.canDeleteAnnotation).toBe(false);
      expect(capabilities.canUseMlAlerts).toBe(false);
      expect(capabilities.canGetTrainedModels).toBe(true);
      expect(capabilities.canTestTrainedModels).toBe(true);

      expect(capabilities.canCreateJob).toBe(false);
      expect(capabilities.canDeleteJob).toBe(false);
      expect(capabilities.canOpenJob).toBe(false);
      expect(capabilities.canCloseJob).toBe(false);
      expect(capabilities.canResetJob).toBe(false);
      expect(capabilities.canForecastJob).toBe(false);
      expect(capabilities.canDeleteForecast).toBe(false);
      expect(capabilities.canStartStopDatafeed).toBe(false);
      expect(capabilities.canUpdateJob).toBe(false);
      expect(capabilities.canCreateDatafeed).toBe(false);
      expect(capabilities.canDeleteDatafeed).toBe(false);
      expect(capabilities.canUpdateDatafeed).toBe(false);
      expect(capabilities.canPreviewDatafeed).toBe(false);
      expect(capabilities.canGetFilters).toBe(false);
      expect(capabilities.canCreateCalendar).toBe(false);
      expect(capabilities.canDeleteCalendar).toBe(false);
      expect(capabilities.canCreateFilter).toBe(false);
      expect(capabilities.canDeleteFilter).toBe(false);
      expect(capabilities.canDeleteDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateDataFrameAnalytics).toBe(false);
      expect(capabilities.canStartStopDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateMlAlerts).toBe(false);
      expect(capabilities.canViewMlNodes).toBe(false);
      expect(capabilities.canCreateTrainedModels).toBe(false);
      expect(capabilities.canCreateInferenceEndpoint).toBe(false);
      expect(capabilities.canDeleteTrainedModels).toBe(false);
      expect(capabilities.canStartStopTrainedModels).toBe(false);

      expect(capabilities.isADEnabled).toBe(true);
      expect(capabilities.isDFAEnabled).toBe(true);
      expect(capabilities.isNLPEnabled).toBe(true);
    });

    test('full capabilities, ml disabled in space', async () => {
      const { getCapabilities } = capabilitiesProvider(
        mlClientNonUpgrade,
        getDefaultMlCapabilities(),
        mlLicense,
        mlIsNotEnabled
      );
      const { capabilities, upgradeInProgress, mlFeatureEnabledInSpace, isPlatinumOrTrialLicense } =
        await getCapabilities();
      expect(upgradeInProgress).toBe(false);
      expect(mlFeatureEnabledInSpace).toBe(false);
      expect(isPlatinumOrTrialLicense).toBe(true);

      expect(capabilities.canGetFieldInfo).toBe(false);
      expect(capabilities.canGetMlInfo).toBe(false);
      expect(capabilities.canUseAiops).toBe(false);
      expect(capabilities.canGetJobs).toBe(false);
      expect(capabilities.canGetDatafeeds).toBe(false);
      expect(capabilities.canGetCalendars).toBe(false);
      expect(capabilities.canFindFileStructure).toBe(false);
      expect(capabilities.canGetDataFrameAnalytics).toBe(false);
      expect(capabilities.canGetAnnotations).toBe(false);
      expect(capabilities.canCreateAnnotation).toBe(false);
      expect(capabilities.canDeleteAnnotation).toBe(false);
      expect(capabilities.canUseMlAlerts).toBe(false);
      expect(capabilities.canGetTrainedModels).toBe(false);
      expect(capabilities.canTestTrainedModels).toBe(false);

      expect(capabilities.canCreateJob).toBe(false);
      expect(capabilities.canDeleteJob).toBe(false);
      expect(capabilities.canOpenJob).toBe(false);
      expect(capabilities.canCloseJob).toBe(false);
      expect(capabilities.canResetJob).toBe(false);
      expect(capabilities.canForecastJob).toBe(false);
      expect(capabilities.canDeleteForecast).toBe(false);
      expect(capabilities.canStartStopDatafeed).toBe(false);
      expect(capabilities.canUpdateJob).toBe(false);
      expect(capabilities.canCreateDatafeed).toBe(false);
      expect(capabilities.canDeleteDatafeed).toBe(false);
      expect(capabilities.canUpdateDatafeed).toBe(false);
      expect(capabilities.canPreviewDatafeed).toBe(false);
      expect(capabilities.canGetFilters).toBe(false);
      expect(capabilities.canCreateCalendar).toBe(false);
      expect(capabilities.canDeleteCalendar).toBe(false);
      expect(capabilities.canCreateFilter).toBe(false);
      expect(capabilities.canDeleteFilter).toBe(false);
      expect(capabilities.canDeleteDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateDataFrameAnalytics).toBe(false);
      expect(capabilities.canStartStopDataFrameAnalytics).toBe(false);
      expect(capabilities.canCreateMlAlerts).toBe(false);
      expect(capabilities.canViewMlNodes).toBe(false);
      expect(capabilities.canCreateTrainedModels).toBe(false);
      expect(capabilities.canCreateInferenceEndpoint).toBe(false);
      expect(capabilities.canDeleteTrainedModels).toBe(false);
      expect(capabilities.canStartStopTrainedModels).toBe(false);

      expect(capabilities.isADEnabled).toBe(true);
      expect(capabilities.isDFAEnabled).toBe(true);
      expect(capabilities.isNLPEnabled).toBe(true);
    });
  });

  test('full capabilities, basic license, ml disabled in space', async () => {
    const { getCapabilities } = capabilitiesProvider(
      mlClientNonUpgrade,
      getDefaultMlCapabilities(),
      mlLicenseBasic,
      mlIsNotEnabled
    );
    const { capabilities, upgradeInProgress, mlFeatureEnabledInSpace, isPlatinumOrTrialLicense } =
      await getCapabilities();

    expect(upgradeInProgress).toBe(false);
    expect(mlFeatureEnabledInSpace).toBe(false);
    expect(isPlatinumOrTrialLicense).toBe(false);

    expect(capabilities.canGetFieldInfo).toBe(false);
    expect(capabilities.canGetMlInfo).toBe(false);
    expect(capabilities.canGetJobs).toBe(false);
    expect(capabilities.canGetDatafeeds).toBe(false);
    expect(capabilities.canGetCalendars).toBe(false);
    expect(capabilities.canFindFileStructure).toBe(false);
    expect(capabilities.canGetDataFrameAnalytics).toBe(false);
    expect(capabilities.canGetAnnotations).toBe(false);
    expect(capabilities.canCreateAnnotation).toBe(false);
    expect(capabilities.canDeleteAnnotation).toBe(false);
    expect(capabilities.canUseMlAlerts).toBe(false);
    expect(capabilities.canGetTrainedModels).toBe(false);
    expect(capabilities.canTestTrainedModels).toBe(false);

    expect(capabilities.canCreateJob).toBe(false);
    expect(capabilities.canDeleteJob).toBe(false);
    expect(capabilities.canOpenJob).toBe(false);
    expect(capabilities.canCloseJob).toBe(false);
    expect(capabilities.canResetJob).toBe(false);
    expect(capabilities.canForecastJob).toBe(false);
    expect(capabilities.canDeleteForecast).toBe(false);
    expect(capabilities.canStartStopDatafeed).toBe(false);
    expect(capabilities.canUpdateJob).toBe(false);
    expect(capabilities.canCreateDatafeed).toBe(false);
    expect(capabilities.canDeleteDatafeed).toBe(false);
    expect(capabilities.canUpdateDatafeed).toBe(false);
    expect(capabilities.canPreviewDatafeed).toBe(false);
    expect(capabilities.canGetFilters).toBe(false);
    expect(capabilities.canCreateCalendar).toBe(false);
    expect(capabilities.canDeleteCalendar).toBe(false);
    expect(capabilities.canCreateFilter).toBe(false);
    expect(capabilities.canDeleteFilter).toBe(false);
    expect(capabilities.canDeleteDataFrameAnalytics).toBe(false);
    expect(capabilities.canCreateDataFrameAnalytics).toBe(false);
    expect(capabilities.canStartStopDataFrameAnalytics).toBe(false);
    expect(capabilities.canCreateMlAlerts).toBe(false);
    expect(capabilities.canViewMlNodes).toBe(false);
    expect(capabilities.canCreateTrainedModels).toBe(false);
    expect(capabilities.canCreateInferenceEndpoint).toBe(false);
    expect(capabilities.canDeleteTrainedModels).toBe(false);
    expect(capabilities.canStartStopTrainedModels).toBe(false);

    expect(capabilities.isADEnabled).toBe(true);
    expect(capabilities.isDFAEnabled).toBe(true);
    expect(capabilities.isNLPEnabled).toBe(true);
  });
});

const createAuthorizationMock = (hasAllRequested: boolean) => ({
  actions: {
    ui: {
      get: jest.fn((feature: string, cap: string) => `${feature}:${cap}`),
    },
  },
  checkPrivilegesWithRequest: jest.fn(() => ({
    globally: jest.fn().mockResolvedValue({ hasAllRequested }),
  })),
});

const fullMlLicense = {
  isMlEnabled: () => true,
  isFullLicense: () => true,
} as MlLicense;

const basicMlLicense = {
  isMlEnabled: () => true,
  isFullLicense: () => false,
} as MlLicense;

const mlDisabledLicense = {
  isMlEnabled: () => false,
  isFullLicense: () => false,
} as MlLicense;

describe('areCapabilitiesAllowedByLicenseAndFeatures', () => {
  test('allows full-license AD capabilities when AD is enabled', () => {
    expect(
      areCapabilitiesAllowedByLicenseAndFeatures(
        getAdminCapabilities(),
        ['canCreateJob'],
        fullMlLicense
      )
    ).toBe(true);
  });

  test('blocks full-license AD capabilities on basic license', () => {
    expect(
      areCapabilitiesAllowedByLicenseAndFeatures(
        getAdminCapabilities(),
        ['canCreateJob'],
        basicMlLicense
      )
    ).toBe(false);
  });

  test('allows basic-license capabilities on basic license', () => {
    expect(
      areCapabilitiesAllowedByLicenseAndFeatures(
        getAdminCapabilities(),
        ['canGetFieldInfo'],
        basicMlLicense
      )
    ).toBe(true);
  });

  test('blocks AD capabilities when AD feature is disabled', () => {
    const capabilities = { ...getAdminCapabilities(), isADEnabled: false };

    expect(
      areCapabilitiesAllowedByLicenseAndFeatures(capabilities, ['canCreateJob'], fullMlLicense)
    ).toBe(false);
  });

  test('blocks all capabilities when ML is disabled in license', () => {
    expect(
      areCapabilitiesAllowedByLicenseAndFeatures(
        getAdminCapabilities(),
        ['canGetFieldInfo'],
        mlDisabledLicense
      )
    ).toBe(false);
  });
});

describe('hasMlCapabilitiesProvider', () => {
  const fakeRequest = { isFakeRequest: true } as any;
  const realRequest = { isFakeRequest: false } as any;

  test('passes when resolved capabilities include all requested capabilities', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getAdminCapabilities());
    const hasMlCapabilities = hasMlCapabilitiesProvider(resolveMlCapabilities, realRequest);

    await expect(hasMlCapabilities(['canCreateJob'])).resolves.toBeUndefined();
  });

  test('throws for real requests when resolved capabilities are insufficient', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getUserCapabilities());
    const hasMlCapabilities = hasMlCapabilitiesProvider(resolveMlCapabilities, realRequest);

    await expect(hasMlCapabilities(['canCreateJob'])).rejects.toBeInstanceOf(
      InsufficientMLCapabilities
    );
  });

  test('uses privilege fallback for fake requests when license and feature gating allow access', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getUserCapabilities());
    const authorization = createAuthorizationMock(true);
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      fakeRequest,
      authorization as any,
      fullMlLicense
    );

    await expect(hasMlCapabilities(['canCreateJob'])).resolves.toBeUndefined();
    expect(authorization.checkPrivilegesWithRequest).toHaveBeenCalledWith(fakeRequest);
  });

  test('does not use privilege fallback for fake requests on basic license', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getUserCapabilities());
    const authorization = createAuthorizationMock(true);
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      fakeRequest,
      authorization as any,
      basicMlLicense
    );

    await expect(hasMlCapabilities(['canCreateJob'])).rejects.toBeInstanceOf(
      InsufficientMLCapabilities
    );
    expect(authorization.checkPrivilegesWithRequest).toHaveBeenCalled();
  });

  test('does not use privilege fallback when AD feature is disabled', async () => {
    const resolveMlCapabilities = jest
      .fn()
      .mockResolvedValue({ ...getUserCapabilities(), isADEnabled: false });
    const authorization = createAuthorizationMock(true);
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      fakeRequest,
      authorization as any,
      fullMlLicense
    );

    await expect(hasMlCapabilities(['canCreateJob'])).rejects.toBeInstanceOf(
      InsufficientMLCapabilities
    );
    expect(authorization.checkPrivilegesWithRequest).toHaveBeenCalled();
  });

  test('does not use privilege fallback when authorization is missing', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getUserCapabilities());
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      fakeRequest,
      undefined,
      fullMlLicense
    );

    await expect(hasMlCapabilities(['canCreateJob'])).rejects.toBeInstanceOf(
      InsufficientMLCapabilities
    );
  });

  test('does not use privilege fallback when mlLicense is missing', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getUserCapabilities());
    const authorization = createAuthorizationMock(true);
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      fakeRequest,
      authorization as any
    );

    await expect(hasMlCapabilities(['canCreateJob'])).rejects.toBeInstanceOf(
      InsufficientMLCapabilities
    );
    expect(authorization.checkPrivilegesWithRequest).not.toHaveBeenCalled();
  });

  test('does not use privilege fallback when role privileges are insufficient', async () => {
    const resolveMlCapabilities = jest.fn().mockResolvedValue(getUserCapabilities());
    const authorization = createAuthorizationMock(false);
    const hasMlCapabilities = hasMlCapabilitiesProvider(
      resolveMlCapabilities,
      fakeRequest,
      authorization as any,
      fullMlLicense
    );

    await expect(hasMlCapabilities(['canCreateJob'])).rejects.toBeInstanceOf(
      InsufficientMLCapabilities
    );
  });
});
