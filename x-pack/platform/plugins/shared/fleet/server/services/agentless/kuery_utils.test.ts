/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { prefixKueryFieldsWithSavedObjectType } from './kuery_utils';

const TYPE = 'fleet-package-policies';

describe('prefixKueryFieldsWithSavedObjectType', () => {
  it('prefixes a bare field name', () => {
    expect(prefixKueryFieldsWithSavedObjectType('name:"foo"', TYPE)).toBe(`${TYPE}.name: "foo"`);
  });

  it('prefixes a nested bare field name', () => {
    expect(prefixKueryFieldsWithSavedObjectType('package.name:"bar"', TYPE)).toBe(
      `${TYPE}.package.name: "bar"`
    );
  });

  it('does not double-prefix a field that already has the type prefix', () => {
    expect(prefixKueryFieldsWithSavedObjectType(`${TYPE}.name:"foo"`, TYPE)).toBe(
      `${TYPE}.name: "foo"`
    );
  });

  it('prefixes all fields in an AND expression', () => {
    expect(prefixKueryFieldsWithSavedObjectType('name:"foo" AND namespace:"default"', TYPE)).toBe(
      `(${TYPE}.name: "foo" AND ${TYPE}.namespace: "default")`
    );
  });

  it('prefixes all fields in an OR expression', () => {
    expect(prefixKueryFieldsWithSavedObjectType('name:"foo" OR name:"bar"', TYPE)).toBe(
      `(${TYPE}.name: "foo" OR ${TYPE}.name: "bar")`
    );
  });

  it('handles a NOT expression', () => {
    expect(prefixKueryFieldsWithSavedObjectType('NOT name:"foo"', TYPE)).toBe(
      `NOT ${TYPE}.name: "foo"`
    );
  });

  it('handles nested boolean expressions', () => {
    expect(
      prefixKueryFieldsWithSavedObjectType(
        'name:"foo" AND (namespace:"default" OR package.name:"bar")',
        TYPE
      )
    ).toBe(
      `(${TYPE}.name: "foo" AND (${TYPE}.namespace: "default" OR ${TYPE}.package.name: "bar"))`
    );
  });
});
