/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getValueAtYamlPath, isUnsafeYamlPathSegment } from './get_value_at_yaml_path';

describe('getValueAtYamlPath', () => {
  const definition = {
    steps: [
      {
        name: 'step-a',
        with: { value: 1 },
      },
    ],
  };

  it('should return nested values for valid paths', () => {
    expect(getValueAtYamlPath(definition, ['steps', 0, 'name'])).toBe('step-a');
  });

  it('should return undefined for missing paths', () => {
    expect(getValueAtYamlPath(definition, ['steps', 99, 'name'])).toBeUndefined();
  });

  it('should not read inherited properties via __proto__ segments', () => {
    const probe = '__wmGetValueAtYamlPathProbe';
    delete (Object.prototype as Record<string, unknown>)[probe];
    (Object.prototype as Record<string, unknown>)[probe] = 'polluted';

    expect(getValueAtYamlPath(definition, ['__proto__', probe])).toBeUndefined();
    expect(Object.hasOwn(definition, probe)).toBe(false);

    delete (Object.prototype as Record<string, unknown>)[probe];
  });

  it('should treat constructor and prototype segments as unsafe', () => {
    expect(isUnsafeYamlPathSegment('__proto__')).toBe(true);
    expect(isUnsafeYamlPathSegment('constructor')).toBe(true);
    expect(isUnsafeYamlPathSegment('prototype')).toBe(true);
    expect(isUnsafeYamlPathSegment('steps')).toBe(false);
    expect(isUnsafeYamlPathSegment(0)).toBe(false);
  });
});
