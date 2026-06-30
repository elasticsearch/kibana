export declare enum AlertingAuthorizationEntity {
    Rule = "rule",
    Alert = "alert"
}
export declare enum ReadOperations {
    Get = "get",
    BulkGet = "bulkGet",
    GetRuleState = "getRuleState",
    GetAlertSummary = "getAlertSummary",
    GetExecutionLog = "getExecutionLog",
    GetActionErrorLog = "getActionErrorLog",
    GetHistory = "getHistory",
    Find = "find",
    GetAuthorizedAlertsIndices = "getAuthorizedAlertsIndices",
    GetRuleExecutionKPI = "getRuleExecutionKPI",
    GetBackfill = "getBackfill",
    FindBackfill = "findBackfill",
    FindGaps = "findGaps",
    GetGapAutoFillScheduler = "getGapAutoFillScheduler",
    FindGapAutoFillSchedulerLogs = "findGapAutoFillSchedulerLogs",
    BulkEditParams = "bulkEditParams"
}
export declare enum WriteOperations {
    Create = "create",
    Delete = "delete",
    Update = "update",
    UpdateApiKey = "updateApiKey",
    Enable = "enable",
    Disable = "disable",
    MuteAll = "muteAll",
    UnmuteAll = "unmuteAll",
    MuteAlert = "muteAlert",
    UnmuteAlert = "unmuteAlert",
    Snooze = "snooze",
    BulkEdit = "bulkEdit",
    BulkDelete = "bulkDelete",
    BulkEnable = "bulkEnable",
    BulkDisable = "bulkDisable",
    Unsnooze = "unsnooze",
    RunSoon = "runSoon",
    ScheduleBackfill = "scheduleBackfill",
    DeleteBackfill = "deleteBackfill",
    FillGaps = "fillGaps",
    CreateGapAutoFillScheduler = "createGapAutoFillScheduler",
    UpdateGapAutoFillScheduler = "updateGapAutoFillScheduler",
    DeleteGapAutoFillScheduler = "deleteGapAutoFillScheduler"
}
