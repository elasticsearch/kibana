/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { registerCoreObjectTypes } from './registration';

// set minimum number of registered saved objects to ensure no object types are removed after 8.8
// declared in internal implementation explicitly to prevent unintended changes.
export const SAVED_OBJECT_TYPES_COUNT = 164 as const;
