/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { BindToFluentSyntax, Container, ServiceIdentifier } from 'inversify';
import { createToken } from '../token';

/**
 * A transient plugin-scoped container that is used to handle interim tasks (e.g. HTTP-request handling).
 * @public
 */
export interface ScopedContainer extends Container {
  /**
   * Similar to `bind` but the binding is exposed to the services outside of the scoped container.
   * @param serviceIdentifier Service identifier to bind and expose.
   */
  expose<T>(serviceIdentifier: ServiceIdentifier<T>): BindToFluentSyntax<T>;

  /**
   * Dispose the container and all of its bindings.
   */
  dispose(): void;
}

/**
 * A transient plugin-scoped container that is used to handle interim tasks (e.g. HTTP-request handling).
 * @public
 */
export const Scope = createToken<ScopedContainer>('Scope');
