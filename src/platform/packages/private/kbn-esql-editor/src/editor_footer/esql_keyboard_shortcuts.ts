/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { isMac } from '@kbn/shared-ux-utility';

const COMMAND_KEY = isMac ? '⌘' : 'CTRL';

export const esqlKeyboardShortcuts: Array<{ keys: readonly string[]; label: string }> = [
  {
    keys: [COMMAND_KEY, 'Enter'],
    label: i18n.translate('esqlEditor.query.runKeyboardShortcutsLabel', {
      defaultMessage: 'Run query',
    }),
  },
  {
    keys: ['⇧', 'Enter'],
    label: i18n.translate('esqlEditor.query.newLineKeyboardShortcutsLabel', {
      defaultMessage: 'New line',
    }),
  },
  {
    keys: [COMMAND_KEY, '/'],
    label: i18n.translate('esqlEditor.query.commentKeyboardShortcutsLabel', {
      defaultMessage: 'Comment/uncomment line',
    }),
  },
  {
    keys: [COMMAND_KEY, 'K'],
    label: i18n.translate('esqlEditor.query.openVisorKeyboardShortcutsLabel', {
      defaultMessage: 'Open quick search',
    }),
  },
  {
    keys: [COMMAND_KEY, 'I'],
    label: i18n.translate('esqlEditor.query.prettifyKeyboardShortcutsLabel', {
      defaultMessage: 'Prettify query',
    }),
  },
  {
    keys: [COMMAND_KEY, 'J'],
    label: i18n.translate('esqlEditor.query.generateFromCommentKeyboardShortcutsLabel', {
      defaultMessage: 'Generate ES|QL from comment',
    }),
  },
];
