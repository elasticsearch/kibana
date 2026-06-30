/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
const createAlertsClientMock = () => {
  return jest.fn().mockImplementation(() => {
    return {
      initializeExecution: jest.fn(),
      processAndLogAlerts: jest.fn(),
      processAlerts: jest.fn(),
      logAlerts: jest.fn(),
      updateAlertMaintenanceWindowIds: jest.fn(),
      getMaintenanceWindowScopedQueryAlerts: jest.fn(),
      getTrackedAlerts: jest.fn(),
      getProcessedAlerts: jest.fn(),
      getBuiltActiveAlertDataByInstanceId: jest.fn(),
      getRawAlertInstancesForState: jest.fn(),
      hasReachedAlertLimit: jest.fn(),
      getMaxAlertLimit: jest.fn().mockReturnValue(1000),
      checkLimitUsage: jest.fn(),
      persistAlerts: jest.fn(),
      clearSnoozedStatusForAlerts: jest.fn(),
      getSummarizedAlerts: jest.fn(),
      factory: jest.fn(),
      client: jest.fn(),
      determineDelayedAlerts: jest.fn(),
      determineFlappingAlerts: jest.fn(),
      updatePersistedAlerts: jest.fn(),
      getAlertsToUpdateWithMaintenanceWindows: jest.fn(),
      getAlertsToUpdateWithLastScheduledActions: jest.fn(),
    };
  });
};

export const alertsClientMock = {
  create: createAlertsClientMock(),
};

const createPublicAlertsClientMock = () => {
  return jest.fn().mockImplementation(() => {
    return {
      create: jest.fn(),
      report: jest.fn(),
      isTrackedAlert: jest.fn(),
      getAlertLimitValue: jest.fn().mockReturnValue(1000),
      setAlertLimitReached: jest.fn(),
      getRecoveredAlerts: jest.fn().mockReturnValue([]),
      setAlertData: jest.fn(),
    };
  });
};

export const publicAlertsClientMock = {
  create: createPublicAlertsClientMock(),
};
