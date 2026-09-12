/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { ReactNode } from 'react';

export const UPDATE_ALL = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.upgradeAll',
  {
    defaultMessage: 'Update all',
  }
);

export const UPDATE_SELECTED_RULES = (numberOfSelectedRules: number) => {
  return i18n.translate(
    'xpack.securitySolution.detectionEngine.rules.upgradeRules.upgradeSelected',
    {
      defaultMessage: 'Update {numberOfSelectedRules} selected rule(s)',
      values: { numberOfSelectedRules },
    }
  );
};

export const BULK_UPDATE_BUTTON_TOOLTIP_NO_PERMISSIONS = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.bulkButtons.noPermissions',
  {
    defaultMessage: "You don't have permissions to update rules",
  }
);

export const BULK_UPDATE_SELECTED_RULES_BUTTON_TOOLTIP_CONFLICTS = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.bulkButtons.selectedRules.conflicts',
  {
    defaultMessage: 'The selected rules have conflicts that must be manually resolved.',
  }
);

export const SEARCH_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.searchBarPlaceholder',
  {
    defaultMessage: 'Search by rule name',
  }
);

export const UPDATE_BUTTON_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.updateButtonLabel',
  {
    defaultMessage: 'Update rule',
  }
);

export const UPDATE_FLYOUT_PER_FIELD_TOOLTIP_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.perFieldTooltip',
  {
    defaultMessage: 'View changes field by field.',
  }
);

export const UPDATE_FLYOUT_JSON_VIEW_TOOLTIP_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDetails.jsonViewTooltip',
  {
    defaultMessage: 'View the latest rule changes in JSON format.',
  }
);

export const RULE_TYPE_CHANGE_CALLOUT_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeRules.ruleTypeChangeCalloutTitle',
  {
    defaultMessage: 'Rule type change',
  }
);

export const RULE_TYPE_CHANGE_CALLOUT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeRules.ruleTypeChangeCalloutDescription',
  {
    defaultMessage:
      'The rule type will change if you update this rule. As a result, exceptions and actions you added may stop working or behave differently.',
  }
);

export const MODIFIED_RULE_UPGRADE_LICENSE_INSUFFICIENT_CALLOUT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeRules.ruleUpgradeLicenseInsufficientCalloutDescription',
  {
    defaultMessage: 'Updating the rule will erase your changes.',
  }
);

export const RULE_TYPE_CHANGE_WITH_CUSTOMIZATIONS_CALLOUT_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeRules.ruleTypeChangeWithCustomizationCalloutDescription',
  {
    defaultMessage:
      'The rule type will change if you update this rule, and your changes will be erased. To save them, first duplicate the rule, then update it. Exceptions and actions you added will not be erased, but may stop working or behave differently.',
  }
);

export const LAST_UPDATE = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeFlyout.header.lastUpdate',
  {
    defaultMessage: 'Last updated',
  }
);

export const UPDATED_BY_AND_WHEN = (updatedBy: ReactNode, updatedAt: ReactNode) => (
  <FormattedMessage
    id="xpack.securitySolution.detectionEngine.upgradeFlyout.header.updated"
    defaultMessage="{updatedBy} on {updatedAt}"
    values={{ updatedBy, updatedAt }}
  />
);

export const SEVERITY = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeFlyout.header.severity',
  {
    defaultMessage: 'Severity',
  }
);

export const FIELD_UPDATES = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeFlyout.header.fieldUpdates',
  {
    defaultMessage: 'Field updates',
  }
);

export const RULE_MODIFIED_BADGE_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeFlyout.ruleModifiedBadgeDescription',
  {
    defaultMessage:
      'The rule was edited after installation and field values differs from the values upon installation',
  }
);

export const RULE_NEW_REVISION_DETECTED_WARNING = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeFlyout.ruleNewRevisionDetectedWarning',
  {
    defaultMessage: 'Installed rule changed',
  }
);

export const RULE_NEW_REVISION_DETECTED_WARNING_DESCRIPTION = (ruleName: string) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.upgradeFlyout.ruleNewVersionDetectedWarningDescription',
    {
      defaultMessage:
        'Someone edited the installed rule "{ruleName}". Upgrade resolved conflicts were reset.',
      values: { ruleName },
    }
  );

export const RULE_NEW_VERSION_DETECTED_WARNING = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeFlyout.ruleNewRevisionDetectedWarning',
  {
    defaultMessage: 'New prebuilt rules package was installed',
  }
);

export const RULE_NEW_VERSION_DETECTED_WARNING_DESCRIPTION = (ruleName: string) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.upgradeFlyout.ruleNewRevisionDetectedWarningDescription',
    {
      defaultMessage:
        'Newer prebuilt rules package were installed in background. It contains a newer rule version for "{ruleName}". Upgrade resolved conflicts were reset.',
      values: { ruleName },
    }
  );

export const CURRENT_RULE_VERSION = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.currentVersionLabel',
  {
    defaultMessage: 'Current rule',
  }
);

export const CURRENT_VERSION_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.currentVersionDescriptionLabel',
  {
    defaultMessage: 'Shows currently installed rule',
  }
);

export const ELASTIC_UPDATE_VERSION = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.elasticUpdateVersionLabel',
  {
    defaultMessage: 'Elastic update',
  }
);

export const UPDATED_VERSION_DESCRIPTION = i18n.translate(
  'xpack.securitySolution.detectionEngine.rules.upgradeRules.updatedVersionDescriptionLabel',
  {
    defaultMessage: 'Shows rule that will be installed',
  }
);
