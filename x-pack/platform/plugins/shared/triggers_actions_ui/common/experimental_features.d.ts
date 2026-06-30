export type ExperimentalFeatures = {
    [K in keyof typeof allowedExperimentalValues]: boolean;
};
/**
 * A list of allowed values that can be used in `xpack.trigger_actions_ui.enableExperimental`.
 * This object is then used to validate and parse the value entered.
 */
export declare const allowedExperimentalValues: Readonly<{
    rulesListDatagrid: true;
    stackAlertsPage: true;
    ruleTagFilter: true;
    ruleStatusFilter: true;
    rulesDetailLogs: true;
    ruleUseExecutionStatus: false;
    ruleKqlBar: false;
    isMustacheAutocompleteOn: false;
    showMustacheAutocompleteSwitch: false;
    alertDeletionSettingsEnabled: true;
}>;
/**
 * Parses the string value used in `xpack.trigger_actions_ui.enableExperimental` kibana configuration,
 * which should be a string of values delimited by a comma (`,`):
 * xpack.trigger_actions_ui.enableExperimental: ['ruleStatusFilter', 'ruleTagFilter']
 *
 * @param configValue
 * @throws TriggersActionsUIInvalidExperimentalValue
 */
export declare const parseExperimentalConfigValue: (configValue: string[]) => ExperimentalFeatures;
export declare const isValidExperimentalValue: (value: string) => boolean;
export declare const getExperimentalAllowedValues: () => string[];
