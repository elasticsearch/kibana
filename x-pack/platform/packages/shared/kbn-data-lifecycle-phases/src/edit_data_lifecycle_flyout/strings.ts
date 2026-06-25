/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

const PREFIX = 'xpack.dataLifecyclePhases.editDataLifecycleFlyout';

export const editDataLifecycleFlyoutStrings = {
  inheritLabel: i18n.translate(`${PREFIX}.inheritLabel`, {
    defaultMessage: 'Inherit lifecycle',
  }),
  viewInheritSourceLink: i18n.translate(`${PREFIX}.viewInheritSourceLink`, {
    defaultMessage: 'View source',
  }),
  lifecycleMethodTitle: i18n.translate(`${PREFIX}.lifecycleMethodTitle`, {
    defaultMessage: 'Lifecycle method',
  }),
  dlmCardTitle: i18n.translate(`${PREFIX}.dlmCardTitle`, {
    defaultMessage: 'Data stream lifecycle',
  }),
  dlmCardDescription: i18n.translate(`${PREFIX}.dlmCardDescription`, {
    defaultMessage:
      'Define your retention rules directly on this stream without needing to create or manage separate policy objects.',
  }),
  ilmCardTitle: i18n.translate(`${PREFIX}.ilmCardTitle`, {
    defaultMessage: 'ILM policy',
  }),
  ilmCardDescription: i18n.translate(`${PREFIX}.ilmCardDescription`, {
    defaultMessage:
      'Attach a reusable Index Lifecycle Management policy that you manage globally across multiple streams or indices.',
  }),
  ilmSearchPlaceholder: i18n.translate(`${PREFIX}.ilmSearchPlaceholder`, {
    defaultMessage: 'Search by policy name',
  }),
  inspectPolicyAriaLabel: (policyName: string) =>
    i18n.translate(`${PREFIX}.inspectPolicyAriaLabel`, {
      defaultMessage: "Inspect policy ''{policyName}''",
      values: { policyName },
    }),
  noInheritedPolicyDescription: i18n.translate(`${PREFIX}.noInheritedPolicyDescription`, {
    defaultMessage: 'No ILM policy is inherited from the parent.',
  }),
  loadingInheritedDescription: i18n.translate(`${PREFIX}.loadingInheritedDescription`, {
    defaultMessage: 'Loading inherited lifecycle…',
  }),
  ilmNotConfiguredDescription: i18n.translate(`${PREFIX}.ilmNotConfiguredDescription`, {
    defaultMessage: 'ILM policies are not available.',
  }),
  cancelButton: i18n.translate(`${PREFIX}.cancelButton`, { defaultMessage: 'Cancel' }),
  applyButton: i18n.translate(`${PREFIX}.applyButton`, { defaultMessage: 'Apply' }),
  retentionInfinity: i18n.translate(`${PREFIX}.retentionInfinity`, {
    defaultMessage: '∞',
  }),
  phasesLabel: (count: number) =>
    i18n.translate(`${PREFIX}.phasesLabel`, {
      defaultMessage: '{count, plural, one {# data phase} other {# data phases}}',
      values: { count },
    }),
  downsampleStepsLabel: (count: number) =>
    i18n.translate(`${PREFIX}.downsampleStepsLabel`, {
      defaultMessage: '{count, plural, one {# downsample step} other {# downsample steps}}',
      values: { count },
    }),
};
