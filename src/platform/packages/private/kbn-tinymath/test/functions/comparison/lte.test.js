/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const { lte } = require('../../../src/functions/comparison/lte');

describe('Lte', () => {
  it('missing args', () => {
    expect(() => lte()).toThrow();
    expect(() => lte(-10)).toThrow();
    expect(() => lte([])).toThrow();
  });

  it('empty arrays', () => {
    expect(lte([], [])).toBeTruthy();
  });

  describe('eq values', () => {
    it('numbers', () => {
      expect(lte(-10, -10)).toBeTruthy();
      expect(lte(10, 10)).toBeTruthy();
      expect(lte(0, 0)).toBeTruthy();
    });

    it('arrays', () => {
      expect(lte([-1], -1)).toBeTruthy();
      expect(lte([-1], [-1])).toBeTruthy();
      expect(lte([-1, -1], -1)).toBeTruthy();
      expect(lte([-1, -1], [-1, -1])).toBeTruthy();
    });
  });

  describe('lt values', () => {
    it('numbers', () => {
      expect(lte(-10, -2)).toBeTruthy();
      expect(lte(10, 20)).toBeTruthy();
      expect(lte(0, 1)).toBeTruthy();
    });

    it('arrays', () => {
      // Should pass
      expect(lte([-1], 0)).toBeTruthy();
      expect(lte([-1], [0])).toBeTruthy();
      expect(lte([-1, -1], 0)).toBeTruthy();
      expect(lte([-1, -1], [0, 0])).toBeTruthy();

      // Should not pass
      expect(lte([-1], -2)).toBeFalsy();
      expect(lte([-1], [-2])).toBeFalsy();
      expect(lte([-1, -1], -2)).toBeFalsy();
      expect(lte([-1, -1], [-2, -2])).toBeFalsy();
      expect(lte([-1, -1], [-2, 2])).toBeFalsy();
    });
  });

  describe('mixed eq and lt values', () => {
    it('arrays', () => {
      expect(lte([5, 10], [5, 30])).toBeTruthy();
      expect(lte([1, 2], [1, 3])).toBeTruthy();
      expect(lte([1, 2], 2)).toBeTruthy();

      // an element above the bound still fails
      expect(lte([1, 2, 3], 2)).toBeFalsy();
      expect(lte([5, 10, 40], [5, 30, 30])).toBeFalsy();
    });
  });

  describe('number lower than or equal to array', () => {
    it('passes only when the number is <= every element', () => {
      expect(lte(1, [1, 2])).toBeTruthy();
      expect(lte(5, [5, 5])).toBeTruthy();
      expect(lte(3, [1, 2])).toBeFalsy();
      expect(lte(2, [1, 3])).toBeFalsy();
    });
  });
});
