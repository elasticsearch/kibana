/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server
 * Side Public License v 1"; you may not use this file except in compliance
 * with, at your election, the "Elastic License 2.0", the "GNU Affero General
 * Public License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const playlistStrings = {
  tabTitle: i18n.translate('dashboard.playlists.tabTitle', {
    defaultMessage: 'Playlists',
  }),
  pageTitle: i18n.translate('dashboard.playlists.pageTitle', {
    defaultMessage: 'Playlists',
  }),
  createButtonLabel: i18n.translate('dashboard.playlists.createButtonLabel', {
    defaultMessage: 'Create playlist',
  }),
  editTitle: (isEditing: boolean) =>
    i18n.translate('dashboard.playlists.editTitle', {
      defaultMessage: '{isEditing, select, true {Edit playlist} other {Create playlist}}',
      values: { isEditing: String(isEditing) },
    }),
  nameLabel: i18n.translate('dashboard.playlists.nameLabel', {
    defaultMessage: 'Name',
  }),
  durationLabel: i18n.translate('dashboard.playlists.durationLabel', {
    defaultMessage: 'Rotation duration (seconds)',
  }),
  durationHelpText: i18n.translate('dashboard.playlists.durationHelpText', {
    defaultMessage: 'Must be greater than zero.',
  }),
  findDashboardsLabel: i18n.translate('dashboard.playlists.findDashboardsLabel', {
    defaultMessage: 'Find dashboards',
  }),
  findDashboardsHelpText: i18n.translate('dashboard.playlists.findDashboardsHelpText', {
    defaultMessage: 'Select dashboards, then arrange their playback order below.',
  }),
  findDashboardsPlaceholder: i18n.translate('dashboard.playlists.findDashboardsPlaceholder', {
    defaultMessage: 'Search dashboards',
  }),
  orderLabel: i18n.translate('dashboard.playlists.orderLabel', {
    defaultMessage: 'Playlist order',
  }),
  orderHelpText: i18n.translate('dashboard.playlists.orderHelpText', {
    defaultMessage: 'Dashboards play from top to bottom.',
  }),
  emptyOrderDescription: i18n.translate('dashboard.playlists.emptyOrderDescription', {
    defaultMessage: 'Select dashboards above to build the playlist order.',
  }),
  saveButtonLabel: i18n.translate('dashboard.playlists.saveButtonLabel', {
    defaultMessage: 'Save',
  }),
  cancelButtonLabel: i18n.translate('dashboard.playlists.cancelButtonLabel', {
    defaultMessage: 'Cancel',
  }),
  emptyState: i18n.translate('dashboard.playlists.emptyState', {
    defaultMessage: 'No playlists yet.',
  }),
  dashboardCount: (count: number) =>
    i18n.translate('dashboard.playlists.dashboardCount', {
      defaultMessage: '{count, plural, one {# dashboard} other {# dashboards}}',
      values: { count },
    }),
  startButtonLabel: i18n.translate('dashboard.playlists.startButtonLabel', {
    defaultMessage: 'Start',
  }),
  editAriaLabel: (name: string) =>
    i18n.translate('dashboard.playlists.editAriaLabel', {
      defaultMessage: 'Edit {name}',
      values: { name },
    }),
  deleteAriaLabel: (name: string) =>
    i18n.translate('dashboard.playlists.deleteAriaLabel', {
      defaultMessage: 'Delete {name}',
      values: { name },
    }),
  moveUpTooltip: i18n.translate('dashboard.playlists.moveUpTooltip', {
    defaultMessage: 'Move dashboard up',
  }),
  moveUpAriaLabel: i18n.translate('dashboard.playlists.moveUpAriaLabel', {
    defaultMessage: 'Move dashboard up',
  }),
  moveDownTooltip: i18n.translate('dashboard.playlists.moveDownTooltip', {
    defaultMessage: 'Move dashboard down',
  }),
  moveDownAriaLabel: i18n.translate('dashboard.playlists.moveDownAriaLabel', {
    defaultMessage: 'Move dashboard down',
  }),
  removeTooltip: i18n.translate('dashboard.playlists.removeTooltip', {
    defaultMessage: 'Remove dashboard',
  }),
  removeAriaLabel: i18n.translate('dashboard.playlists.removeAriaLabel', {
    defaultMessage: 'Remove dashboard',
  }),
  errorTitle: i18n.translate('dashboard.playlists.errorTitle', {
    defaultMessage: 'Playlist error',
  }),
  loadErrorMessage: i18n.translate('dashboard.playlists.loadErrorMessage', {
    defaultMessage: 'Unable to load playlists.',
  }),
  searchErrorMessage: i18n.translate('dashboard.playlists.searchErrorMessage', {
    defaultMessage: 'Unable to search dashboards.',
  }),
  saveErrorMessage: i18n.translate('dashboard.playlists.saveErrorMessage', {
    defaultMessage: 'Unable to save playlist.',
  }),
  deleteErrorMessage: i18n.translate('dashboard.playlists.deleteErrorMessage', {
    defaultMessage: 'Unable to delete playlist.',
  }),
};
