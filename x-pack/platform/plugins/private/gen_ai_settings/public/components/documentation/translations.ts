/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const DOCUMENTATION_TITLE = i18n.translate('genAiSettings.documentation.title', {
  defaultMessage: 'Documentation',
});

export const DOCUMENTATION_DESCRIPTION = i18n.translate('genAiSettings.documentation.description', {
  defaultMessage:
    'Help improve Agent Builder responses to your prompts by installing product documentation. All entries are global to the cluster.',
});

export const DOCUMENTATION_TABLE_CAPTION = i18n.translate(
  'genAiSettings.documentation.tableCaption',
  {
    defaultMessage: 'Documentation status and installation management actions',
  }
);

export const LEARN_MORE = i18n.translate('genAiSettings.documentation.learnMore', {
  defaultMessage: 'Learn more',
});

export const AIR_GAPPED_HINT = i18n.translate('genAiSettings.documentation.airGappedHint', {
  defaultMessage:
    'If your environment has no internet access, you can host these artifacts yourself.',
});

export const ELASTIC_DOCS_NAME = i18n.translate('genAiSettings.documentation.elasticDocs.name', {
  defaultMessage: 'Elastic documentation',
});

export const SECURITY_LABS_NAME = i18n.translate('genAiSettings.documentation.securityLabs.name', {
  defaultMessage: 'Security labs',
});

export const COLUMN_NAME = i18n.translate('genAiSettings.documentation.column.name', {
  defaultMessage: 'Name',
});

export const COLUMN_STATUS = i18n.translate('genAiSettings.documentation.column.status', {
  defaultMessage: 'Status',
});

export const COLUMN_ACTIONS = i18n.translate('genAiSettings.documentation.column.actions', {
  defaultMessage: 'Actions',
});

export const STATUS_INSTALLED = i18n.translate('genAiSettings.documentation.status.installed', {
  defaultMessage: 'Installed',
});

export const STATUS_NOT_INSTALLED = i18n.translate(
  'genAiSettings.documentation.status.notInstalled',
  {
    defaultMessage: 'Not installed',
  }
);

export const STATUS_INSTALLING = i18n.translate('genAiSettings.documentation.status.installing', {
  defaultMessage: 'Installing...',
});

export const STATUS_UNINSTALLING = i18n.translate(
  'genAiSettings.documentation.status.uninstalling',
  {
    defaultMessage: 'Uninstalling...',
  }
);

export const STATUS_ERROR = i18n.translate('genAiSettings.documentation.status.error', {
  defaultMessage: 'Error',
});

export const STATUS_NOT_AVAILABLE = i18n.translate(
  'genAiSettings.documentation.status.notAvailable',
  {
    defaultMessage: 'Not available',
  }
);

export const ACTION_INSTALL = i18n.translate('genAiSettings.documentation.action.install', {
  defaultMessage: 'Install',
});

export const ACTION_UPDATE = i18n.translate('genAiSettings.documentation.action.update', {
  defaultMessage: 'Update',
});

export const ACTION_UNINSTALL = i18n.translate('genAiSettings.documentation.action.uninstall', {
  defaultMessage: 'Uninstall',
});

export const ACTION_RETRY = i18n.translate('genAiSettings.documentation.action.retry', {
  defaultMessage: 'Retry',
});

export const getInstallSuccessTitle = (name: string) =>
  i18n.translate('genAiSettings.documentation.install.successWithName', {
    defaultMessage: '{name} installed successfully',
    values: { name },
  });

export const getInstallErrorTitle = (name: string) =>
  i18n.translate('genAiSettings.documentation.install.errorWithName', {
    defaultMessage: 'Failed to install {name}',
    values: { name },
  });

export const getUninstallSuccessTitle = (name: string) =>
  i18n.translate('genAiSettings.documentation.uninstall.successWithName', {
    defaultMessage: '{name} uninstalled successfully',
    values: { name },
  });

export const getUninstallErrorTitle = (name: string) =>
  i18n.translate('genAiSettings.documentation.uninstall.errorWithName', {
    defaultMessage: 'Failed to uninstall {name}',
    values: { name },
  });

export const TECH_PREVIEW = i18n.translate('genAiSettings.documentation.techPreview', {
  defaultMessage: 'TECH PREVIEW',
});

export const UPDATE_AVAILABLE = i18n.translate('genAiSettings.documentation.updateAvailable', {
  defaultMessage: 'Update available',
});

export const SHOWING = i18n.translate('genAiSettings.documentation.showing', {
  defaultMessage: 'Showing',
});

export const OF = i18n.translate('genAiSettings.documentation.of', {
  defaultMessage: 'of',
});

export const INSUFFICIENT_PRIVILEGES = i18n.translate(
  'genAiSettings.documentation.insufficientPrivileges',
  {
    defaultMessage: "Agent Builder 'All' privileges are required to manage documentation",
  }
);

export const getModelDeploymentTimeoutSuggestion = (inferenceId: string) =>
  i18n.translate('genAiSettings.documentation.error.modelDeploymentTimeoutSuggestion', {
    defaultMessage:
      'The ML model deployment for {inferenceId} timed out. ML nodes may not have enough memory, or you may have adaptive allocation enabled with 0 minimum allocation, which could cause the model to not start within the expected time when scaling. Use the trained model stats API to verify its state, then retry once the model has started.',
    values: { inferenceId },
  });
