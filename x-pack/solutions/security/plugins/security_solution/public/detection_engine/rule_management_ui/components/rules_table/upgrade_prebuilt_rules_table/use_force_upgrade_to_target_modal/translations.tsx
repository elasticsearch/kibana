/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { RuleUpgradeCustomizationCounts } from '../../../../../rule_management/model/prebuilt_rule_upgrade';

export const FORCE_UPGRADE_TO_TARGET_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.forceUpgradeToTargetModal.messageTitle',
  {
    defaultMessage: 'This will overwrite rule customizations',
  }
);

export const FORCE_UPGRADE_TO_TARGET_MODAL_CONFIRM = i18n.translate(
  'xpack.securitySolution.detectionEngine.forceUpgradeToTargetModal.confirmTitle',
  {
    defaultMessage: 'Update to Elastic version',
  }
);

export const FORCE_UPGRADE_TO_TARGET_MODAL_CANCEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.forceUpgradeToTargetModal.cancelTitle',
  {
    defaultMessage: 'Cancel',
  }
);

export const ForceUpgradeToTargetModalBody = ({
  total,
  customizedCount,
}: RuleUpgradeCustomizationCounts) => (
  <FormattedMessage
    id="xpack.securitySolution.detectionEngine.forceUpgradeToTargetModal.body"
    defaultMessage="{total} {total, plural, one {rule} other {rules}} will be updated to the exact Elastic version. {customizedCountBold} of {totalBold} {total, plural, one {is a rule} other {are rules}} you've customized — updating will permanently discard those customizations."
    values={{
      total,
      customizedCountBold: <strong>{customizedCount}</strong>,
      totalBold: <strong>{total}</strong>,
    }}
  />
);
