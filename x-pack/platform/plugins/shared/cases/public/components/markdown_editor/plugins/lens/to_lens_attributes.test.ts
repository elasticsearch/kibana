/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toLensAttributes } from './to_lens_attributes';

const mockIsSupported = jest.fn();
const mockFromAPIFormat = jest.fn();

jest.mock('@kbn/lens-embeddable-utils', () => ({
  LensConfigBuilder: jest.fn().mockImplementation(() => ({
    isSupported: (type?: string) => mockIsSupported(type),
    fromAPIFormat: (config: unknown) => mockFromAPIFormat(config),
  })),
}));

describe('toLensAttributes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes internal Lens state through untouched when the type is unsupported', () => {
    // Internal Lens state is keyed by the saved-object type 'lens', which has no
    // API converter. It must NOT be routed through `fromAPIFormat` (that throws
    // `No attributes converter found for chart type: lens`).
    mockIsSupported.mockReturnValue(false);
    const internalState = { type: 'lens', state: { foo: 'bar' } };

    const result = toLensAttributes(internalState);

    expect(mockIsSupported).toHaveBeenCalledWith('lens');
    expect(mockFromAPIFormat).not.toHaveBeenCalled();
    expect(result).toBe(internalState);
  });

  it('routes API-format input through fromAPIFormat when the chart type is supported', () => {
    mockIsSupported.mockReturnValue(true);
    const converted = { state: { converted: true } };
    mockFromAPIFormat.mockReturnValue(converted);
    const apiConfig = { type: 'xy', layers: [] };

    const result = toLensAttributes(apiConfig);

    expect(mockIsSupported).toHaveBeenCalledWith('xy');
    expect(mockFromAPIFormat).toHaveBeenCalledWith(apiConfig);
    expect(result).toBe(converted);
  });

  it('passes through when there is no type field', () => {
    mockIsSupported.mockReturnValue(false);
    const attributes = { state: { foo: 'bar' } };

    const result = toLensAttributes(attributes);

    expect(mockIsSupported).toHaveBeenCalledWith(undefined);
    expect(mockFromAPIFormat).not.toHaveBeenCalled();
    expect(result).toBe(attributes);
  });
});
