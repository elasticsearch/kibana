/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getNestedGroupOffset, normalizeCenterOnMark, positionSandboxTooltip } from './tooltip';

describe('sandbox tooltip placement', () => {
  const box = {
    anchorHeight: 20,
    anchorLeft: 100,
    anchorTop: 80,
    anchorWidth: 40,
    containerHeight: 400,
    containerWidth: 400,
    padding: 8,
    tooltipHeight: 30,
    tooltipWidth: 50,
  };

  it('places top, right, bottom, and left relative to the mark', () => {
    expect(positionSandboxTooltip({ ...box, position: 'top' })).toEqual({
      left: 95,
      top: 42,
    });
    expect(positionSandboxTooltip({ ...box, position: 'right' })).toEqual({
      left: 148,
      top: 75,
    });
    expect(positionSandboxTooltip({ ...box, position: 'bottom' })).toEqual({
      left: 95,
      top: 108,
    });
    expect(positionSandboxTooltip({ ...box, position: 'left' })).toEqual({
      left: 42,
      top: 75,
    });
  });

  it('clamps to container padding', () => {
    expect(
      positionSandboxTooltip({
        ...box,
        anchorLeft: 0,
        anchorTop: 0,
        containerHeight: 40,
        containerWidth: 40,
        position: 'top',
      })
    ).toEqual({ left: 8, top: 8 });
  });

  it('includes ancestor group offsets', () => {
    expect(
      getNestedGroupOffset({
        bounds: { height: () => 10, width: () => 10, x1: 5, y1: 6 },
        mark: {
          group: {
            x: 10,
            y: 20,
            mark: { group: { x: 3, y: 4 } },
          },
        },
      })
    ).toEqual({ x: 13, y: 24 });
  });
});

describe('normalizeCenterOnMark', () => {
  it('matches visTypeVega parser semantics', () => {
    expect(normalizeCenterOnMark(undefined)).toBe(50);
    expect(normalizeCenterOnMark(10)).toBe(10);
    expect(normalizeCenterOnMark(true)).toBe(Number.MAX_VALUE);
    expect(normalizeCenterOnMark(false)).toBe(-1);
  });
});
