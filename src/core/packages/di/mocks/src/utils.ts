/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Container } from 'inversify';
import { OnSetup, OnStart } from '@kbn/core-di';

export function setup(container: Container): void {
  return container.getAll(OnSetup, { chained: true }).forEach((fn) => fn(container));
}

export function start(container: Container): void {
  return container.getAll(OnStart, { chained: true }).forEach((fn) => fn(container));
}
