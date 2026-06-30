/**
 * Migrates legacy lastRun.outcomeMsg from string to string[]
 *
 * Rule SO schema forces lastRun.outcomeMsg to be string[].
 * However, some rules may have lastRun.outcomeMsg as string after upgrading from 7.x due to
 * lack of migration. lastRun.outcomeMsg schema change from string to string[] happened after
 * classical migrations were deprecated due to Serverless. And quite often it's not an issue
 * as lastRun is absent.
 */
export declare function migrateLegacyLastRunOutcomeMsg<LastRun extends {
    outcomeMsg?: unknown;
}>(lastRun: LastRun): LastRun;
