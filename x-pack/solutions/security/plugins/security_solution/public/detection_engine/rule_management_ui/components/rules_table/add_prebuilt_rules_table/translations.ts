/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const INSTALL_ALL = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.addRules.installAllButtonTitle',
  {
    defaultMessage: 'Install all',
  }
);

export const INSTALL_ALL_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.addRules.installAllButtonAriaLabel',
  {
    defaultMessage: 'Install all Elastic rules',
  }
);

export const INSTALL_SELECTED_RULES = (numberOfSelectedRules: number) => {
  return i18n.translate(
    'xpack.securitySolution.detectionEngine.rules.addRules.installSelectedRules',
    {
      defaultMessage: 'Install {numberOfSelectedRules} selected rule(s)',
      values: { numberOfSelectedRules },
    }
  );
};

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.addRules.searchBarPlaceholder',
  {
    defaultMessage: 'Search by rule name',
  }
);

export const INSTALL_BUTTON_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.installButtonLabel',
  {
    defaultMessage: 'Install',
  }
);

export const INSTALL_WITHOUT_ENABLING_BUTTON_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.installWithoutEnablingButtonLabel',
  {
    defaultMessage: 'Install without enabling',
  }
);

export const INSTALL_AND_ENABLE_BUTTON_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.installAndEnableButtonLabel',
  {
    defaultMessage: 'Install and enable',
  }
);

export const INSTALL_RULE_BUTTON_ARIA_LABEL = (ruleName: string) =>
  i18n.translate('xpack.securitySolution.addRules.installRuleButton.ariaLabel', {
    defaultMessage: 'Install "{ruleName}"',
    values: {
      ruleName,
    },
  });

export const INSTALL_RULES_OVERFLOW_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.installOverflowButton.ariaLabel',
  {
    defaultMessage: 'More install options',
  }
);

export const RULE_ALREADY_INSTALLED_TOOLTIP = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.ruleAlreadyInstalledTooltip',
  {
    defaultMessage: 'This rule is already installed.',
  }
);
