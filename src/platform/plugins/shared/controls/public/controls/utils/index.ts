/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { OPTIONS_LIST_CONTROL } from '@kbn/controls-constants';
import type { DSLOptionsListComponentApi } from '../data_controls/options_list_control/types';
import type { OptionsListComponentApi } from '../types';

export const isDSLOptionsListApi = (
  api: OptionsListComponentApi
): api is DSLOptionsListComponentApi => {
  return api.type === OPTIONS_LIST_CONTROL;
};

export { getControlsTimezone } from './get_controls_timezone';
