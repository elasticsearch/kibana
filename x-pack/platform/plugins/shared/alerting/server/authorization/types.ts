/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export enum AlertingAuthorizationEntity {
  Rule = 'rule',
  Alert = 'alert',
}

export enum ReadOperations {
  Get = 'get',
  BulkGet = 'bulkGet',
  GetRuleState = 'getRuleState',
  GetAlertSummary = 'getAlertSummary',
  GetExecutionLog = 'getExecutionLog',
  GetActionErrorLog = 'getActionErrorLog',
  GetHistory = 'getHistory',
  Find = 'find',
  FindMutedAlerts = 'findMutedAlerts',
  GetAuthorizedAlertsIndices = 'getAuthorizedAlertsIndices',
  GetRuleExecutionKPI = 'getRuleExecutionKPI',
  GetBackfill = 'getBackfill',
  FindBackfill = 'findBackfill',
  FindGaps = 'findGaps',
  GetGapAutoFillScheduler = 'getGapAutoFillScheduler',
  FindGapAutoFillSchedulerLogs = 'findGapAutoFillSchedulerLogs',
  BulkEditParams = 'bulkEditParams', // special operation for bulk editing rule params
}

export enum WriteOperations {
  Create = 'create',
  Delete = 'delete',
  Update = 'update',
  UpdateApiKey = 'updateApiKey',
  Enable = 'enable',
  Disable = 'disable',
  MuteAll = 'muteAll',
  UnmuteAll = 'unmuteAll',
  MuteAlert = 'muteAlert',
  UnmuteAlert = 'unmuteAlert',
  Snooze = 'snooze',
  BulkEdit = 'bulkEdit',
  BulkDelete = 'bulkDelete',
  BulkEnable = 'bulkEnable',
  BulkDisable = 'bulkDisable',
  Unsnooze = 'unsnooze',
  RunSoon = 'runSoon',
  ScheduleBackfill = 'scheduleBackfill',
  DeleteBackfill = 'deleteBackfill',
  FillGaps = 'fillGaps',
  CreateGapAutoFillScheduler = 'createGapAutoFillScheduler',
  UpdateGapAutoFillScheduler = 'updateGapAutoFillScheduler',
  DeleteGapAutoFillScheduler = 'deleteGapAutoFillScheduler',
  snoozeAlert = 'snoozeAlert',
  unsnoozeAlert = 'unsnoozeAlert',
}
