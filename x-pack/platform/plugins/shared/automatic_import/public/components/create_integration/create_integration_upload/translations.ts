/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const UPLOAD_TITLE = i18n.translate('xpack.automaticImport.createIntegrationUpload.title', {
  defaultMessage: 'Upload integration package',
});

export const UPLOAD_INPUT_TEXT = i18n.translate(
  'xpack.automaticImport.createIntegrationUpload.inputText',
  {
    defaultMessage: 'Drag and drop a .zip file or Browse files',
  }
);

export const INSTALL_BUTTON = i18n.translate(
  'xpack.automaticImport.createIntegrationUpload.install',
  {
    defaultMessage: 'Add to Elastic',
  }
);

export const BACK_BUTTON = i18n.translate('xpack.automaticImport.createIntegrationUpload.back', {
  defaultMessage: 'Back',
});

export const CLOSE_BUTTON = i18n.translate('xpack.automaticImport.createIntegrationUpload.close', {
  defaultMessage: 'Close',
});

export const UPLOAD_ERROR = i18n.translate('xpack.automaticImport.createIntegrationUpload.error', {
  defaultMessage: 'Error installing package',
});

export const SUCCESS_TITLE = i18n.translate(
  'xpack.automaticImport.createIntegrationUpload.successTitle',
  {
    defaultMessage: 'Integration installed successfully',
  }
);

export const DUPLICATE_PACKAGE_NAME_ERROR = (packageName: string) =>
  i18n.translate('xpack.automaticImport.createIntegrationUpload.duplicatePackageNameError', {
    defaultMessage: 'A package named "{packageName}" already exists.',
    values: { packageName },
  });

export const AUTOMATIC_IMPORT_PACKAGE_ERROR = (packageName: string) =>
  i18n.translate(
    'xpack.automaticImport.createIntegrationUpload.automaticImportPackageErrorMessage',
    {
      defaultMessage:
        '"{packageName}" is an Automatic Import integration, please update it in Manage my integrations instead.',
      values: { packageName },
    }
  );

export const VERSION_NOT_NEWER_ERROR = (
  packageName: string,
  zipVersion: string,
  installedVersion: string
) =>
  i18n.translate('xpack.automaticImport.createIntegrationUpload.versionNotNewerErrorMessage', {
    defaultMessage:
      'Version {zipVersion} of "{packageName}" is not newer than the installed version {installedVersion}.',
    values: { packageName, zipVersion, installedVersion },
  });

export const INVALID_PACKAGE_VERSION_ERROR = (packageName: string) =>
  i18n.translate(
    'xpack.automaticImport.createIntegrationUpload.invalidPackageVersionErrorMessage',
    {
      defaultMessage:
        'Cannot upgrade "{packageName}" because the uploaded or installed version is missing or invalid.',
      values: { packageName },
    }
  );
