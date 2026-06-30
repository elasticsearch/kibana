import type { SanitizedRule } from '../../common';
/**
 * Returns information that can be used to navigate to a specific page to view the given rule.
 *
 * @param rule The rule to view
 * @returns A URL that is meant to be relative to your application id, or a state object that your application uses to render
 * the rule. This information is intended to be used with cores NavigateToApp function, along with the application id that was
 * originally registered to {@link PluginSetupContract.registerNavigation}.
 *
 */
export type AlertNavigationHandler = (rule: SanitizedRule) => string | undefined;
