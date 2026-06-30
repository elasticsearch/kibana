/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LensConfigBuilder } from '@kbn/lens-embeddable-utils';

// Lens may return attributes in either the API spec (when the `lens.apiFormat`
// builder is enabled) or the internal Lens state (the default). Only the API
// spec carries a chart type the builder can convert; internal state is keyed by
// the saved-object type ('lens'), which has no converter. Guard on
// `isSupported` so internal state passes through untouched instead of throwing
// `No attributes converter found for chart type: lens`.
export const toLensAttributes = (attributes: Record<string, unknown>): Record<string, unknown> => {
  const builder = new LensConfigBuilder();
  return builder.isSupported(attributes.type as string | undefined)
    ? builder.fromAPIFormat(attributes as Parameters<LensConfigBuilder['fromAPIFormat']>[0])
    : attributes;
};
