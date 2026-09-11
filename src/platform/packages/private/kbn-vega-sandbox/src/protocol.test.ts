/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { VegaSandboxErrorCode, VegaSandboxWarningCode } from './common';
import { VEGA_SANDBOX_PROTOCOL_VERSION, isVegaSandboxOutboundMessage } from './protocol';

describe('Vega sandbox protocol', () => {
  it('keeps the protocol version at 1 for additive inspector messages', () => {
    expect(VEGA_SANDBOX_PROTOCOL_VERSION).toBe(1);
  });
});

describe('isVegaSandboxOutboundMessage', () => {
  const validByType: Record<string, unknown> = {
    rendered: { type: 'rendered', renderId: 'r1' },
    error: {
      type: 'error',
      renderId: 'r1',
      error: { code: VegaSandboxErrorCode.RenderFailed },
    },
    warn: {
      type: 'warn',
      warning: { code: VegaSandboxWarningCode.RuntimeWarning, values: { message: 'x' } },
    },
    applyFilter: {
      type: 'applyFilter',
      intent: { fn: 'kibanaAddFilter', args: [{}, 'index'] },
    },
    saveState: { type: 'saveState', state: { signals: { clicked: 1 } } },
    openHref: { type: 'openHref', href: 'https://example.com' },
    validateExternalUrl: { type: 'validateExternalUrl', requestId: 'req-1', uri: 'https://x' },
    inspectorSnapshot: {
      type: 'inspectorSnapshot',
      kind: 'dataSets',
      requestId: 'insp-1',
      payload: [],
    },
    inspectorUpdate: { type: 'inspectorUpdate', kind: 'signals', payload: { data: [] } },
  };

  it.each(Object.keys(validByType))('accepts a well-formed %s message', (type) => {
    expect(isVegaSandboxOutboundMessage(validByType[type])).toBe(true);
  });

  it('rejects null, arrays, and missing type', () => {
    expect(isVegaSandboxOutboundMessage(null)).toBe(false);
    expect(isVegaSandboxOutboundMessage([])).toBe(false);
    expect(isVegaSandboxOutboundMessage({ missingType: true })).toBe(false);
  });

  it('rejects unknown types', () => {
    expect(isVegaSandboxOutboundMessage({ type: 'not-a-protocol-type' })).toBe(false);
  });

  it('rejects malformed known-type payloads', () => {
    expect(isVegaSandboxOutboundMessage({ type: 'error' })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'error', error: { code: 1 } })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'error', error: { code: 'not_a_code' } })).toBe(
      false
    );
    expect(isVegaSandboxOutboundMessage({ type: 'rendered' })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'rendered', renderId: 1 })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'warn' })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'warn', warning: { code: 'nope' } })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'applyFilter' })).toBe(false);
    expect(
      isVegaSandboxOutboundMessage({ type: 'applyFilter', intent: { fn: 'eval', args: [] } })
    ).toBe(false);
    expect(
      isVegaSandboxOutboundMessage({
        type: 'applyFilter',
        intent: { fn: 'kibanaAddFilter', args: 'not-array' },
      })
    ).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'saveState' })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'saveState', state: [] })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'openHref' })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'openHref', href: 1 })).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'validateExternalUrl', requestId: 'x' })).toBe(
      false
    );
    expect(
      isVegaSandboxOutboundMessage({
        type: 'inspectorSnapshot',
        kind: 'signals',
        requestId: 'x',
      })
    ).toBe(false);
    expect(isVegaSandboxOutboundMessage({ type: 'inspectorUpdate', kind: 'dataSets' })).toBe(false);
  });
});
