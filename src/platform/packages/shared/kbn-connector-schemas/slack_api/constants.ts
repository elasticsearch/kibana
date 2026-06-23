/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { i18n } from '@kbn/i18n';

export const CONNECTOR_ID = '.slack_api';
export const CONNECTOR_NAME = i18n.translate('connectors.slackApi.title', {
  defaultMessage: 'Slack API',
});

export const SLACK_URL = 'https://slack.com/api/';

export enum SUB_ACTION {
  VALID_CHANNEL_ID = 'validChannelId',
  POST_MESSAGE = 'postMessage',
  POST_BLOCKKIT = 'postBlockkit',
}
