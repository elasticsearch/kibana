/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

/** Localized strings for the create / edit data source flyout. */
export const createDataSourceFlyoutStrings = {
  createTitle: () =>
    i18n.translate('xpack.dataFederation.createFlyout.title', {
      defaultMessage: 'Connect external data source',
    }),

  createDescription: () =>
    i18n.translate('xpack.dataFederation.createFlyout.createDescription', {
      defaultMessage:
        'Define where your external data is stored and how Elasticsearch connects to it.',
    }),

  editTitle: () =>
    i18n.translate('xpack.dataFederation.createFlyout.editTitle', {
      defaultMessage: 'Edit data source',
    }),

  nameRequired: () =>
    i18n.translate('xpack.dataFederation.createFlyout.nameRequired', {
      defaultMessage: 'Name is required.',
    }),

  nameAlreadyExists: () =>
    i18n.translate('xpack.dataFederation.createFlyout.nameAlreadyExists', {
      defaultMessage: 'A data source with this name already exists.',
    }),

  typeLabel: () =>
    i18n.translate('xpack.dataFederation.createFlyout.typeLabel', {
      defaultMessage: 'Data source type',
    }),

  typeAriaLabel: () =>
    i18n.translate('xpack.dataFederation.createFlyout.typeAriaLabel', {
      defaultMessage: 'Data source type',
    }),

  nameLabel: () =>
    i18n.translate('xpack.dataFederation.createFlyout.nameLabel', {
      defaultMessage: 'Name',
    }),

  descriptionLabel: () =>
    i18n.translate('xpack.dataFederation.createFlyout.descriptionLabel', {
      defaultMessage: 'Description',
    }),

  cancelButton: () =>
    i18n.translate('xpack.dataFederation.createFlyout.cancelButton', {
      defaultMessage: 'Cancel',
    }),

  connectButton: () =>
    i18n.translate('xpack.dataFederation.createFlyout.connectButton', {
      defaultMessage: 'Connect',
    }),

  saveButton: () =>
    i18n.translate('xpack.dataFederation.createFlyout.saveButton', {
      defaultMessage: 'Save',
    }),
};
