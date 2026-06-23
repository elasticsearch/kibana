/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

// ──────────────── Flyout ──────────────────────────────────────────────────────

export const accessFlyoutTitle = (agentName: string) =>
  i18n.translate('xpack.agentBuilder.acl.flyout.title', {
    defaultMessage: 'Manage access for {agentName}',
    values: { agentName },
  });

export const accessFlyoutSubtitle = (agentName: string) =>
  i18n.translate('xpack.agentBuilder.acl.flyout.subtitle', {
    defaultMessage: 'For {agentName}',
    values: { agentName },
  });

export const accessFlyoutCancel = i18n.translate('xpack.agentBuilder.acl.flyout.cancel', {
  defaultMessage: 'Cancel',
});

export const accessFlyoutSave = i18n.translate('xpack.agentBuilder.acl.flyout.save', {
  defaultMessage: 'Save changes',
});

// Access control mode context strip ───────────────────────────────────────────

/**
 * Default-access blurb shown in the banner above the form for each access control mode.
 *
 * Each message stitches together the agent's current access control mode with the
 * default behavior that mode implies, plus a reminder that ACL entries grant
 * additional access on top.
 */
export const accessControlModeContextMessage = (accessControlModeLabel: string) => ({
  publicMessage: i18n.translate('xpack.agentBuilder.acl.flyout.contextPublic', {
    defaultMessage:
      '{accessControlModeLabel} by default. Anyone with access to Agent Builder can view and edit. Add entries below to grant additional permissions like delete or manage access.',
    values: { accessControlModeLabel },
  }),
  sharedMessage: i18n.translate('xpack.agentBuilder.acl.flyout.contextShared', {
    defaultMessage:
      '{accessControlModeLabel} by default. Anyone with access to Agent Builder can view this agent; only the owner or an administrator can edit. Add entries below to grant additional permissions.',
    values: { accessControlModeLabel },
  }),
  privateMessage: i18n.translate('xpack.agentBuilder.acl.flyout.contextPrivate', {
    defaultMessage:
      '{accessControlModeLabel} by default. Only the owner or an administrator can view and edit. Add entries below to grant access to specific people or roles.',
    values: { accessControlModeLabel },
  }),
});

// Sections ────────────────────────────────────────────────────────────────────

export const accessFlyoutPeopleSection = i18n.translate(
  'xpack.agentBuilder.acl.flyout.peopleSectionTitle',
  { defaultMessage: 'People' }
);

export const accessFlyoutPeopleHelp = i18n.translate(
  'xpack.agentBuilder.acl.flyout.peopleSectionHelp',
  { defaultMessage: 'Grant additional access beyond the access control mode.' }
);

export const accessFlyoutAddPeoplePlaceholder = i18n.translate(
  'xpack.agentBuilder.acl.flyout.addPeoplePlaceholder',
  { defaultMessage: 'Add a user…' }
);

export const accessFlyoutNoPeople = i18n.translate('xpack.agentBuilder.acl.flyout.noPeople', {
  defaultMessage: 'No people have been granted direct access.',
});

// Row controls ────────────────────────────────────────────────────────────────

export const accessFlyoutRoleAriaLabel = i18n.translate(
  'xpack.agentBuilder.acl.flyout.roleAriaLabel',
  { defaultMessage: 'Access level' }
);

export const accessFlyoutRemoveAriaLabel = i18n.translate(
  'xpack.agentBuilder.acl.flyout.removeAriaLabel',
  { defaultMessage: 'Remove access entry' }
);

export const accessFlyoutSaveErrorTitle = i18n.translate(
  'xpack.agentBuilder.acl.flyout.saveErrorTitle',
  { defaultMessage: 'Could not save access' }
);

export const accessFlyoutLoadErrorTitle = i18n.translate(
  'xpack.agentBuilder.acl.flyout.loadErrorTitle',
  { defaultMessage: 'Could not load access' }
);

export const accessFlyoutLoadErrorBody = i18n.translate(
  'xpack.agentBuilder.acl.flyout.loadErrorBody',
  { defaultMessage: 'Try again, or close and reopen this panel.' }
);

export const accessFlyoutHiddenTitle = i18n.translate('xpack.agentBuilder.acl.flyout.hiddenTitle', {
  defaultMessage: 'Access details are hidden',
});

export const accessFlyoutHiddenBody = i18n.translate('xpack.agentBuilder.acl.flyout.hiddenBody', {
  defaultMessage: 'You can use this agent, but only its owner or an admin can manage who else can.',
});

export const accessSummaryCardTitle = i18n.translate('xpack.agentBuilder.acl.summary.title', {
  defaultMessage: 'Access',
});

export const accessSummaryManageButton = i18n.translate(
  'xpack.agentBuilder.acl.summary.manageButton',
  { defaultMessage: 'Manage access' }
);

export const accessSummaryDefaultDescription = i18n.translate(
  'xpack.agentBuilder.acl.summary.defaultDescription',
  {
    defaultMessage:
      'Anyone who can see this agent gets the access set by its access control mode. Add entries to grant more.',
  }
);

export const accessSummaryHiddenDescription = i18n.translate(
  'xpack.agentBuilder.acl.summary.hiddenDescription',
  { defaultMessage: 'This agent has custom access controls.' }
);

export const accessSummaryCount = (users: number) =>
  i18n.translate('xpack.agentBuilder.acl.summary.count', {
    defaultMessage: '{users, plural, one {# user has} other {# users have}} additional access.',
    values: { users },
  });

export const accessSummaryLoading = i18n.translate('xpack.agentBuilder.acl.summary.loading', {
  defaultMessage: 'Loading access…',
});

// ──────────────── List badge ─────────────────────────────────────────────────

export const accessFlyoutCustomBadge = i18n.translate(
  'xpack.agentBuilder.acl.list.customAccessTooltip',
  { defaultMessage: 'Custom access' }
);

export const accessFlyoutCustomBadgeWithCount = (count: number) =>
  i18n.translate('xpack.agentBuilder.acl.list.customAccessTooltipWithCount', {
    defaultMessage:
      '{count, plural, one {# additional access entry} other {# additional access entries}}',
    values: { count },
  });
