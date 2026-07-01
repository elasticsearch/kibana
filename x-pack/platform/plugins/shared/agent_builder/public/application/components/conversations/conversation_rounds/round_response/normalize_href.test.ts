/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import { normalizeHref } from './normalize_href';

const basePathFor = (value: string) =>
  httpServiceMock.createStartContract({ basePath: value }).basePath;

const TEST_KIBANA_PATH = '/app/security/rules/add_rules/abc-123';

describe('normalizeHref', () => {
  describe('root-relative paths', () => {
    it('no server base path + default space -> leaves unchanged', () => {
      expect(normalizeHref(TEST_KIBANA_PATH, basePathFor(''))).toBe(TEST_KIBANA_PATH);
    });

    it('no server base path + custom space -> prepends the space', () => {
      expect(normalizeHref(TEST_KIBANA_PATH, basePathFor('/s/my-space'))).toBe(
        '/s/my-space/app/security/rules/add_rules/abc-123'
      );
    });

    it('with server base path + default space -> prepends the server base path', () => {
      expect(normalizeHref(TEST_KIBANA_PATH, basePathFor('/kbn'))).toBe(
        '/kbn/app/security/rules/add_rules/abc-123'
      );
    });

    it('with server base path + custom space -> prepends the server base path and space', () => {
      expect(normalizeHref(TEST_KIBANA_PATH, basePathFor('/kbn/s/my-space'))).toBe(
        '/kbn/s/my-space/app/security/rules/add_rules/abc-123'
      );
    });

    it('preserves the query string and fragment when prepending', () => {
      expect(normalizeHref(`${TEST_KIBANA_PATH}?tab=about#summary`, basePathFor('/kbn'))).toBe(
        '/kbn/app/security/rules/add_rules/abc-123?tab=about#summary'
      );
    });
  });

  describe('hrefs that must not be rewritten', () => {
    it('absolute URL -> unchanged', () => {
      expect(normalizeHref('https://www.elastic.co/docs', basePathFor('/kbn'))).toBe(
        'https://www.elastic.co/docs'
      );
    });

    it('protocol-relative URL -> unchanged', () => {
      expect(normalizeHref('//cdn.example.com/asset.js', basePathFor('/kbn'))).toBe(
        '//cdn.example.com/asset.js'
      );
    });

    it('relative path -> unchanged', () => {
      expect(normalizeHref('app/security/rules', basePathFor('/kbn'))).toBe('app/security/rules');
    });

    it('fragment-only hrefs -> unchanged', () => {
      expect(normalizeHref('#section', basePathFor('/kbn'))).toBe('#section');
    });
  });
});
