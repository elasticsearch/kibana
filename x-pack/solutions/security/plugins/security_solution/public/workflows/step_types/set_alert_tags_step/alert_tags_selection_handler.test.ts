/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SelectionContext } from '@kbn/workflows/types/latest';
import { DEFAULT_ALERT_TAGS_KEY } from '../../../../common/constants';
import { KibanaServices } from '../../../common/lib/kibana';
import { alertTagsSelection } from './alert_tags_selection_handler';

jest.mock('../../../common/lib/kibana');

const createSelectionContext = () => ({
  stepType: 'security.setAlertTags' as const,
  scope: 'input' as const,
  propertyKey: 'tags_to_add',
  values: { config: {}, input: {} },
});

const defaultTags = ['Duplicate', 'False positive', 'Further investigation required'];

const mockUiSettingsGet = (tags: unknown) => {
  const get = jest.fn((key: string) => (key === DEFAULT_ALERT_TAGS_KEY ? tags : undefined));
  (KibanaServices.get as jest.Mock).mockReturnValue({ uiSettings: { get } });
  return get;
};

describe('alertTagsSelection', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    it('returns all configured tags when the query is empty', async () => {
      mockUiSettingsGet(defaultTags);

      const results = await alertTagsSelection.search('   ', createSelectionContext());

      expect(results).toEqual([
        { value: 'Duplicate' },
        { value: 'False positive' },
        { value: 'Further investigation required' },
      ]);
    });

    it('filters tags by query (case-insensitive)', async () => {
      mockUiSettingsGet(defaultTags);

      const results = await alertTagsSelection.search('FALSE', createSelectionContext());

      expect(results).toEqual([{ value: 'False positive' }]);
    });

    it('returns an empty list when the UI setting is missing or not an array', async () => {
      mockUiSettingsGet(undefined);

      const results = await alertTagsSelection.search('', createSelectionContext());

      expect(results).toEqual([]);
    });

    it('caps the number of suggestions when browsing', async () => {
      mockUiSettingsGet(Array.from({ length: 20 }, (_, i) => `tag-${i}`));

      const results = await alertTagsSelection.search('', createSelectionContext());

      expect(results).toHaveLength(15);
    });
  });

  describe('resolve', () => {
    it('resolves a configured tag', async () => {
      mockUiSettingsGet(defaultTags);

      const resolved = await alertTagsSelection.resolve('Duplicate', createSelectionContext());

      expect(resolved).toEqual({ value: 'Duplicate' });
    });

    it('accepts a free-form tag that is not configured', async () => {
      mockUiSettingsGet(defaultTags);

      const resolved = await alertTagsSelection.resolve('custom-tag', createSelectionContext());

      expect(resolved).toEqual({ value: 'custom-tag' });
    });

    it('treats an empty value as valid with no decoration (not an error)', async () => {
      mockUiSettingsGet(defaultTags);

      const resolved = await alertTagsSelection.resolve('   ', createSelectionContext());

      expect(resolved).toEqual({ value: '', label: '' });
    });
  });

  describe('getDetails', () => {
    it('marks a configured tag as known', async () => {
      mockUiSettingsGet(defaultTags);

      const details = await alertTagsSelection.getDetails('Duplicate', createSelectionContext(), {
        value: 'Duplicate',
      });

      expect(details.message).toContain('Duplicate');
      expect(details.message).toContain('configured alert tag');
    });

    it('describes a custom tag as applicable but not configured', async () => {
      mockUiSettingsGet(defaultTags);

      const details = await alertTagsSelection.getDetails(
        'custom-tag',
        createSelectionContext(),
        null
      );

      expect(details.message).toContain('custom-tag');
      expect(details.message).toContain('can still be applied');
    });
  });

  // The fields these handlers attach to (`tags_to_add` / `tags_to_remove`) are arrays, so the
  // validation pipeline passes the whole array (not a scalar) to `resolve`/`getDetails`. These
  // guard against the regression where a non-string value crashed the entire YAML validation
  // (`value.trim is not a function`).
  describe('non-string property values (array fields)', () => {
    // The handler is typed for scalar string selection, but at runtime the framework can pass the
    // raw array property value; cast through unknown to exercise that path.
    const asValue = (value: unknown) => value as string;
    const ctx = () => createSelectionContext() as SelectionContext;

    it('resolves an array value to its last entry without throwing', async () => {
      mockUiSettingsGet(defaultTags);

      const resolved = await alertTagsSelection.resolve(asValue(['Duplicate']), ctx());

      expect(resolved).toEqual({ value: 'Duplicate' });
    });

    it('treats an empty array value as valid with no decoration (not an error)', async () => {
      mockUiSettingsGet(defaultTags);

      const resolved = await alertTagsSelection.resolve(asValue([]), ctx());

      expect(resolved).toEqual({ value: '', label: '' });
    });

    it('searches using the last array entry without throwing', async () => {
      mockUiSettingsGet(defaultTags);

      const results = await alertTagsSelection.search(asValue(['false']), ctx());

      expect(results).toEqual([{ value: 'False positive' }]);
    });

    it('produces details for an array value without throwing', async () => {
      mockUiSettingsGet(defaultTags);

      const details = await alertTagsSelection.getDetails(asValue(['Duplicate']), ctx(), null);

      expect(details.message).toContain('Duplicate');
    });
  });
});
