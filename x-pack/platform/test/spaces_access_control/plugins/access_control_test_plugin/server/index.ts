/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AccessControlTestPlugin } from './plugin';

export const plugin = async () => new AccessControlTestPlugin();
export { ACCESS_CONTROL_TYPE, NON_ACCESS_CONTROL_TYPE } from './plugin';
