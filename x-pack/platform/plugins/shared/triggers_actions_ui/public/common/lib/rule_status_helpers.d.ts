import type { RuleLastRunOutcomes, RuleExecutionStatuses } from '@kbn/alerting-plugin/common';
import { type EuiThemeComputed } from '@elastic/eui';
import type { Rule } from '../../types';
export declare const getOutcomeHealthColor: (status: RuleLastRunOutcomes, euiTheme: EuiThemeComputed) => string;
export declare const getExecutionStatusHealthColor: (status: RuleExecutionStatuses, euiTheme: EuiThemeComputed) => string;
export declare const getRuleHealthColor: (rule: Rule, euiTheme: EuiThemeComputed) => string;
export declare const getIsLicenseError: (rule: Rule) => boolean;
export declare const getRuleStatusMessage: ({ rule, licenseErrorText, lastOutcomeTranslations, executionStatusTranslations, }: {
    rule: Rule;
    licenseErrorText: string;
    lastOutcomeTranslations: Record<string, string>;
    executionStatusTranslations: Record<string, string>;
}) => string | null | undefined;
