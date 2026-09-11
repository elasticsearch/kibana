/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const CANCEL = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.updateAttacksModal.cancelButtonLabel',
  {
    defaultMessage: 'Cancel',
  }
);

export const UPDATE_ATTACKS_ONLY = ({
  attackDiscoveriesCount,
}: {
  attackDiscoveriesCount: number;
}) => {
  return i18n.translate(
    'xpack.securitySolution.detections.hooks.attacks.bulkActions.updateAttacksModal.updateAttacksOnlyButtonLabel',
    {
      defaultMessage:
        'Mark {attackDiscoveriesCount, plural, =1 {discovery} other {discoveries}} only',
      values: {
        attackDiscoveriesCount,
      },
    }
  );
};

export const UPDATE_ATTACKS_AND_ALERTS = ({
  alertsCount,
  attackDiscoveriesCount,
}: {
  alertsCount: number;
  attackDiscoveriesCount: number;
}) => {
  return i18n.translate(
    'xpack.securitySolution.detections.hooks.attacks.bulkActions.updateAttacksModal.updateAttacksAndAlertsButtonLabel',
    {
      defaultMessage:
        'Mark {alertsCount, plural, =1 {alert} other {alerts}} & {attackDiscoveriesCount, plural, =1 {discovery} other {discoveries}}',
      values: {
        alertsCount,
        attackDiscoveriesCount,
      },
    }
  );
};

export const UPDATE_ATTACKS_TITLE = () => {
  return i18n.translate(
    'xpack.securitySolution.detections.hooks.attacks.bulkActions.updateAttacksModal.updateAttacksTitle',
    {
      defaultMessage: 'Update attacks?',
    }
  );
};

export const UPDATE_ATTACKS_ASSOCIATED = ({
  alertsCount,
  attackDiscoveriesCount,
}: {
  alertsCount: number;
  attackDiscoveriesCount: number;
}) => {
  return i18n.translate(
    'xpack.securitySolution.detections.hooks.attacks.bulkActions.updateAttacksModal.updateAttacksAssociatedModalBody',
    {
      defaultMessage:
        'Update {alertsCount, plural, =1 {alert} other {alerts}} associated with {attackDiscoveriesCount, plural, =1 {the attack discovery} other {{attackDiscoveriesCount} attack discoveries}}?',
      values: {
        alertsCount,
        attackDiscoveriesCount,
      },
    }
  );
};

export const BULK_ACTION_OPEN_SELECTED = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.openSelectedTitle',
  {
    defaultMessage: 'Mark as open',
  }
);

export const BULK_ACTION_ACKNOWLEDGED_SELECTED = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.acknowledgedSelectedTitle',
  {
    defaultMessage: 'Mark as acknowledged',
  }
);

export const BULK_ACTION_CLOSE_SELECTED = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.closeSelectedTitle',
  {
    defaultMessage: 'Mark as closed',
  }
);

export const ADD_TO_NEW_CASE = i18n.translate(
  'xpack.securitySolution.visualizationActions.addToNewCase',
  {
    defaultMessage: 'Add to new case',
  }
);

export const ADD_TO_EXISTING_CASE = i18n.translate(
  'xpack.securitySolution.visualizationActions.addToExistingCase',
  {
    defaultMessage: 'Add to existing case',
  }
);

export const ATTACK_ALERTS_TRUNCATED = ({
  alertCount,
  attachedAlertCount,
}: {
  alertCount: number;
  attachedAlertCount: number;
}) =>
  i18n.translate(
    'xpack.securitySolution.detections.hooks.attacks.bulkActions.attackAlertsTruncatedWarningTitle',
    {
      defaultMessage:
        'Added {attachedAlertCount} of the {alertCount} alerts in this attack. A case accepts at most {attachedAlertCount} alerts per request.',
      values: {
        alertCount,
        attachedAlertCount,
      },
    }
  );

export const ATTACK_TAGS_CONTEXT_MENU_ITEM_TITLE = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.alertTagsContextMenuItemTitle',
  {
    defaultMessage: 'Apply attack tags',
  }
);

export const ATTACK_TAGS_CONTEXT_MENU_ITEM_TOOLTIP_INFO = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.alertTagsContextMenuItemTooltip',
  {
    defaultMessage: 'Change attack tag options in Kibana Advanced Settings.',
  }
);

export const ATTACK_ASSIGNEES_CONTEXT_MENU_ITEM_TITLE = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.alertAssigneesContextMenuItemTitle',
  {
    defaultMessage: 'Assign attack',
  }
);

export const REMOVE_ATTACK_ASSIGNEES_CONTEXT_MENU_TITLE = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.removeAlertAssigneesContextMenuTitle',
  {
    defaultMessage: 'Unassign attack',
  }
);

export const CLOSE_ATTACK_BUTTON_MESSAGE = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.closeAttackButtonMessage',
  {
    defaultMessage: 'Close attack',
  }
);

export const ATTACK_TAGS_MENU_EMPTY = i18n.translate(
  'xpack.securitySolution.detections.hooks.attacks.bulkActions.attackTagsMenuEmpty',
  {
    defaultMessage: 'No attack tag options exist, add tag options in Kibana Advanced Settings.',
  }
);
