/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { selectDatasets } from './select_datasets';

const REGISTRY = [{ id: 'synthetic-smoke' }, { id: 'customer-zero' }, { id: 'orcabench' }];

const selectedIds = (requested: string | undefined) =>
  selectDatasets(REGISTRY, requested).map((dataset) => dataset.id);

describe('selectDatasets', () => {
  describe('when every dataset should run', () => {
    it.each([
      ['unset', undefined],
      ['empty', ''],
      ['whitespace', '   '],
      ['the "all" selector', 'all'],
      ['"all" padded with whitespace', '  all  '],
      ['"all" alongside specific ids', 'synthetic-smoke,all'],
    ])('returns the whole registry when NIGHTSHIFT_DATASETS is %s', (_label, requested) => {
      expect(selectedIds(requested)).toEqual(['synthetic-smoke', 'customer-zero', 'orcabench']);
    });
  });

  it('selects a single dataset by id', () => {
    expect(selectedIds('customer-zero')).toEqual(['customer-zero']);
  });

  it('selects several datasets from a comma-separated list', () => {
    expect(selectedIds('synthetic-smoke,orcabench')).toEqual(['synthetic-smoke', 'orcabench']);
  });

  it('ignores whitespace around ids', () => {
    expect(selectedIds(' synthetic-smoke , orcabench ')).toEqual(['synthetic-smoke', 'orcabench']);
  });

  it('ignores repeated ids', () => {
    expect(selectedIds('orcabench,orcabench')).toEqual(['orcabench']);
  });

  it('follows registry order rather than the order ids were requested in', () => {
    expect(selectedIds('orcabench,synthetic-smoke')).toEqual(['synthetic-smoke', 'orcabench']);
  });

  it('reads NIGHTSHIFT_DATASETS when no selection is passed', () => {
    const previous = process.env.NIGHTSHIFT_DATASETS;
    process.env.NIGHTSHIFT_DATASETS = 'customer-zero';

    try {
      expect(selectDatasets(REGISTRY).map((dataset) => dataset.id)).toEqual(['customer-zero']);
    } finally {
      process.env.NIGHTSHIFT_DATASETS = previous;
    }
  });

  it('throws and lists the available ids for an unknown dataset', () => {
    expect(() => selectedIds('synthetic-smoke,nope')).toThrow(
      /Unknown dataset\(s\) in NIGHTSHIFT_DATASETS: nope\. Available: synthetic-smoke, customer-zero, orcabench, or "all"/
    );
  });

  it.each([
    ['a trailing comma', 'orcabench,'],
    ['a leading comma', ',orcabench'],
    ['a gap', 'a,,b'],
  ])('throws on %s', (_label, requested) => {
    expect(() => selectedIds(requested)).toThrow(/contains an empty item/);
  });
});
