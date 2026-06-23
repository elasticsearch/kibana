/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLCallbacks } from '@kbn/esql-types';
import type { ESQLMessage } from '../../commands/definitions/types';

export interface QuickFixMessage {
  code: ESQLMessage['code'];
  data?: ESQLMessage['data'];
  location?: ESQLMessage['location'];
}

export interface QuickFix {
  // Title of the quick fix button
  title: string;
  // A function that receives the current query and returns it corrected.
  fixQuery: (query: string) => string | undefined;
  // A function that determines if the quick fix should be displayed under some special condition,
  // it will be always visible if not provided.
  displayCondition?: (query: string, callbacks: ESQLCallbacks) => Promise<boolean>;
}
