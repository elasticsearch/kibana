/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RelatedIntegration } from '../../../../../common/api/detection_engine';
import type { ValidationFuncArg } from '../../../../shared_imports';
import { validateRelatedIntegration } from './validate_related_integration';

describe('validateRelatedIntegration', () => {
  describe('with successful outcome', () => {
    it.each([
      ['simple package version dependency', { package: 'some-package', version: '1.2.3' }],
      ['caret package version dependency', { package: 'some-package', version: '^1.2.3' }],
      ['tilde package version dependency', { package: 'some-package', version: '~1.2.3' }],
      ['caret range-set dependency', { package: 'some-package', version: '^8.2.0 || ^9.0.0' }],
      ['mixed range-set dependency', { package: 'some-package', version: '~1.2.3 || ^2.0.0' }],
      ['comparator dependency', { package: 'some-package', version: '>=8.2.0' }],
      ['compound comparator dependency', { package: 'some-package', version: '>1.0.0 <2.0.0' }],
      ['spaced operator dependency', { package: 'some-package', version: ' ~ 1.2.3' }],
    ])(`validates %s`, (_, relatedIntegration) => {
      const arg = {
        value: relatedIntegration,
      } as ValidationFuncArg<RelatedIntegration, RelatedIntegration>;

      const result = validateRelatedIntegration(arg);

      expect(result).toBeUndefined();
    });

    it('validates empty package as a valid related integration', () => {
      const relatedIntegration = { package: '', version: '1.2.3' };
      const arg = {
        value: relatedIntegration,
        path: 'form.path.to.field',
      } as ValidationFuncArg<RelatedIntegration, RelatedIntegration>;

      const result = validateRelatedIntegration(arg);

      expect(result).toBeUndefined();
    });

    it('ignores version when package is empty', () => {
      const relatedIntegration = { package: '', version: 'invalid' };
      const arg = {
        value: relatedIntegration,
        path: 'form.path.to.field',
      } as ValidationFuncArg<RelatedIntegration, RelatedIntegration>;

      const result = validateRelatedIntegration(arg);

      expect(result).toBeUndefined();
    });
  });

  describe('with unsuccessful outcome', () => {
    it('validates empty version', () => {
      const relatedIntegration = { package: 'some-package', version: '' };
      const arg = {
        value: relatedIntegration,
        path: 'form.path.to.field',
      } as ValidationFuncArg<RelatedIntegration, RelatedIntegration>;

      const result = validateRelatedIntegration(arg);

      expect(result).toMatchObject({
        code: 'ERR_FIELD_MISSING',
        path: 'form.path.to.field.version',
      });
    });

    it('validates version with white spaces', () => {
      const relatedIntegration = { package: 'some-package', version: '  ' };
      const arg = {
        value: relatedIntegration,
        path: 'form.path.to.field',
      } as ValidationFuncArg<RelatedIntegration, RelatedIntegration>;

      const result = validateRelatedIntegration(arg);

      expect(result).toMatchObject({
        code: 'ERR_FIELD_MISSING',
        path: 'form.path.to.field.version',
      });
    });

    it.each([
      ['invalid format version', { package: 'some-package', version: '^1.2.' }],
      ['non-semver version', { package: 'some-package', version: 'invalid' }],
      ['range-set with invalid part', { package: 'some-package', version: '1.2.3 || invalid' }],
    ])(`validates %s`, (_, relatedIntegration) => {
      const arg = {
        value: relatedIntegration,
        path: 'form.path.to.field',
      } as ValidationFuncArg<RelatedIntegration, RelatedIntegration>;

      const result = validateRelatedIntegration(arg);

      expect(result).toMatchObject({
        code: 'ERR_FIELD_FORMAT',
        path: 'form.path.to.field.version',
      });
    });
  });
});
