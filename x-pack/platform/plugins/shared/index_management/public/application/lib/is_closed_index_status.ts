/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { INDEX_CLOSED } from '../../../common/constants';
import { indexStatusLabels } from './index_status_labels';

export const isClosedIndexStatus = (status?: string) =>
  status === INDEX_CLOSED || status === indexStatusLabels[INDEX_CLOSED];
