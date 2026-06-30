/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleChangeTracking } from '@kbn/alerting-types';

/**
 * Security solution domain specific rule change
 * tracking actions to cover operations like
 * prebuilt rules installation and upgrade.
 */
export enum SecurityRuleChangeTrackingAction {
  ruleInstall = 'rule_install',
  ruleUpgrade = 'rule_upgrade',
  ruleDuplicate = 'rule_duplicate',
  ruleImport = 'rule_import',
  ruleRevert = 'rule_revert',
  ruleRestore = 'rule_restore',
}

/**
 * Security Solution specific rule change tracking type.
 * Restricts action to SecurityRuleChangeTrackingAction values, representing
 * domain-specific operations like rule install, upgrade, import, etc.
 * Consumers should pass a non-default action to distinguish domain specific
 * operations from generic alerting change tracking actions, see RuleChangeTrackingAction.
 * Omit the action field to let the underlying RulesClient apply the default action for the operation.
 */
export type SecurityRuleChangeTracking<
  ChangeAction extends string = SecurityRuleChangeTrackingAction
> = RuleChangeTracking<ChangeAction>;
