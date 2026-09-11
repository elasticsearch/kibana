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

export const playlistRunnerStrings = {
  unableToLoadErrorMessage: i18n.translate('dashboard.playlists.runner.unableToLoadErrorMessage', {
    defaultMessage: 'Unable to load playlist.',
  }),
  unavailableTitle: i18n.translate('dashboard.playlists.runner.unavailableTitle', {
    defaultMessage: 'Playlist unavailable',
  }),
  exitButtonLabel: i18n.translate('dashboard.playlists.runner.exitButtonLabel', {
    defaultMessage: 'Exit',
  }),
  playbackStoppedTitle: i18n.translate('dashboard.playlists.runner.playbackStoppedTitle', {
    defaultMessage: 'Playback stopped',
  }),
  previousTooltip: i18n.translate('dashboard.playlists.runner.previousTooltip', {
    defaultMessage: 'Previous dashboard',
  }),
  previousAriaLabel: i18n.translate('dashboard.playlists.runner.previousAriaLabel', {
    defaultMessage: 'Previous dashboard',
  }),
  pauseButtonLabel: i18n.translate('dashboard.playlists.runner.pauseButtonLabel', {
    defaultMessage: 'Pause',
  }),
  resumeButtonLabel: i18n.translate('dashboard.playlists.runner.resumeButtonLabel', {
    defaultMessage: 'Resume',
  }),
  nextTooltip: i18n.translate('dashboard.playlists.runner.nextTooltip', {
    defaultMessage: 'Next dashboard',
  }),
  nextAriaLabel: i18n.translate('dashboard.playlists.runner.nextAriaLabel', {
    defaultMessage: 'Next dashboard',
  }),
  exitTooltip: i18n.translate('dashboard.playlists.runner.exitTooltip', {
    defaultMessage: 'Exit playlist',
  }),
  positionLabel: (current: number, total: number) =>
    i18n.translate('dashboard.playlists.runner.positionLabel', {
      defaultMessage: '{current} / {total}',
      values: { current, total },
    }),
};
