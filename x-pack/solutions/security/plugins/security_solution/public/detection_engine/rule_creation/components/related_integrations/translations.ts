/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const RELATED_INTEGRATIONS_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.fieldRelatedIntegrationsLabel',
  {
    defaultMessage: 'Related integrations',
  }
);

export const RELATED_INTEGRATION_FIELDS_HELP_TEXT = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.helpText',
  {
    defaultMessage: 'Select an integration and correct a version constraint if necessary.',
  }
);

export const RELATED_INTEGRATION_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.relatedIntegrationAriaLabel',
  {
    defaultMessage: 'Integrations selector',
  }
);

export const RELATED_INTEGRATION_VERSION_DEPENDENCY_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.relatedIntegrationVersionDependencyAriaLabel',
  {
    defaultMessage: 'Related integration version constraint',
  }
);

export const RELATED_INTEGRATION_VERSION_DEPENDENCY_PLACEHOLDER = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.relatedIntegrationVersionDependencyPlaceholder',
  {
    defaultMessage: 'Enter version',
  }
);

export const REMOVE_RELATED_INTEGRATION_BUTTON_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.removeRelatedIntegrationButtonAriaLabel',
  {
    defaultMessage: 'Remove related integration',
  }
);

export const ADD_INTEGRATION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.addIntegration',
  {
    defaultMessage: 'Add integration',
  }
);

export const INTEGRATION_VERSION = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.integrationVersion',
  {
    defaultMessage: 'Version',
  }
);

export const VERSION_DEPENDENCY_REQUIRED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.validation.versionRequired',
  {
    defaultMessage: 'Version constraint must be specified. For example, ^1.2.3.',
  }
);

export const VERSION_DEPENDENCY_INVALID = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.validation.versionInvalid',
  {
    defaultMessage:
      'Version constraint is invalid. Use a valid semver range expression e.g. ^1.2.3, ~1.2.3, 1.2.3, >=1.2.3, or ^1.2.3 || ^2.0.0.',
  }
);

export const INTEGRATION_NOT_INSTALLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.notInstalledText',
  {
    defaultMessage: 'Not installed',
  }
);

export const INTEGRATION_INSTALLED_AND_DISABLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.installedDisabledText',
  {
    defaultMessage: 'Installed: Disabled',
  }
);

export const INTEGRATION_INSTALLED_AND_ENABLED = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.installedEnabledText',
  {
    defaultMessage: 'Installed: Enabled',
  }
);

export const INTEGRATION_DISABLED = (integrationTitle: string) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.integrationDisabledText',
    {
      defaultMessage: '{integrationTitle}: Disabled',
      values: {
        integrationTitle,
      },
    }
  );

export const INTEGRATION_ENABLED = (integrationTitle: string) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.integrationEnabledText',
    {
      defaultMessage: '{integrationTitle}: Enabled',
      values: {
        integrationTitle,
      },
    }
  );

export const RELATED_INTEGRATIONS_HELP_ARIA_LABEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.ruleDescription.relatedIntegrations.helpAriaLabel',
  {
    defaultMessage: 'Related integrations help',
  }
);
