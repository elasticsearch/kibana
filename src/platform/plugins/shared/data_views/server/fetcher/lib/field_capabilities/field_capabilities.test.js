/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint import/no-duplicates: 0 */
import sinon from 'sinon';
import { identity, shuffle, sortBy } from 'lodash';

import { getFieldCapabilities } from '.';

import { callFieldCapsApi } from '../es_api';
import * as callFieldCapsApiNS from '../es_api';

import { readFieldCapsResponse } from './field_caps_response';
import * as readFieldCapsResponseNS from './field_caps_response';

import { mergeOverrides } from './overrides';
import * as mergeOverridesNS from './overrides';

describe('index_patterns/field_capabilities/field_capabilities', () => {
  let sandbox;
  beforeEach(() => (sandbox = sinon.createSandbox()));
  afterEach(() => sandbox.restore());

  const footballs = [
    { 'could be aything': true },
    { 'used to verify that values are directly passed through': true },
  ];

  const fillUndefinedParams = (args) => ({
    callCluster: undefined,
    abortSignal: undefined,
    indices: undefined,
    expandWildcards: undefined,
    fieldCapsOptions: undefined,
    fieldTypes: undefined,
    indexFilter: undefined,
    fields: undefined,
    includeEmptyFields: undefined,
    runtimeMappings: undefined,
    projectRouting: undefined,
    ...args,
  });

  const getArgsWithCallCluster = (args = {}) => ({ callCluster: callFieldCapsApi, ...args });

  const stubDeps = (options = {}) => {
    const { esResponse = [], fieldsFromFieldCaps = [], mergeOverrides = identity } = options;

    sandbox
      .stub(callFieldCapsApiNS, 'callFieldCapsApi')
      .value(sinon.stub().callsFake(async () => ({ body: esResponse })));
    sandbox
      .stub(readFieldCapsResponseNS, 'readFieldCapsResponse')
      .value(sinon.stub().returns(fieldsFromFieldCaps));
    sandbox.stub(mergeOverridesNS, 'mergeOverrides').value(sinon.stub().callsFake(mergeOverrides));
  };

  describe('calls `callFieldCapsApi()`', () => {
    it('passes exact `callCluster` and `indices` args through', async () => {
      stubDeps();

      const args = getArgsWithCallCluster({ indices: ['index1', 'index2'] });

      await getFieldCapabilities(args);
      sinon.assert.calledOnce(callFieldCapsApi);
      sinon.assert.calledWithExactly(callFieldCapsApi, fillUndefinedParams(args));
    });
  });

  describe('calls `readFieldCapsResponse`', () => {
    it('passes exact es response', async () => {
      stubDeps({
        esResponse: footballs[0],
      });

      const args = getArgsWithCallCluster({ indices: ['index1', 'index2'] });

      await getFieldCapabilities(args);
      sinon.assert.calledOnce(readFieldCapsResponse);
      sinon.assert.calledWithExactly(readFieldCapsResponse, footballs[0]);
    });
  });

  describe('response order', () => {
    it('supports fields that start with an underscore', async () => {
      const fields = ['_field_a', '_field_b'];

      stubDeps({
        fieldsFromFieldCaps: fields.map((name) => ({ name })),
      });

      const fieldNames = (await getFieldCapabilities(getArgsWithCallCluster())).fields.map(
        (field) => field.name
      );
      expect(fieldNames).toEqual(fields);
    });

    it('always returns fields in alphabetical order', async () => {
      const letters = 'ambcdfjopngihkel'.split('');
      const sortedLetters = sortBy(letters);

      stubDeps({
        fieldsFromFieldCaps: shuffle(letters.map((name) => ({ name }))),
      });

      const fieldNames = (await getFieldCapabilities(getArgsWithCallCluster())).fields.map(
        (field) => field.name
      );
      expect(fieldNames).toEqual(sortedLetters);
    });
  });

  describe('metaFields', () => {
    it('ensures there is a response for each metaField', async () => {
      stubDeps({
        fieldsFromFieldCaps: [{ name: 'foo' }, { name: 'bar' }],
      });

      const args = getArgsWithCallCluster({ metaFields: ['meta1', 'meta2'] });

      const resp = await getFieldCapabilities(args);
      expect(resp.fields).toHaveLength(4);
      expect(resp.fields.map((field) => field.name)).toEqual(['bar', 'foo', 'meta1', 'meta2']);
    });
  });

  describe('defaults', () => {
    const properties = ['name', 'type', 'searchable', 'aggregatable', 'readFromDocValues'];

    const createField = () => ({
      name: footballs[0],
      type: footballs[0],
      searchable: footballs[0],
      aggregatable: footballs[0],
      readFromDocValues: footballs[0],
    });

    describe('ensures that every field has property:', () => {
      properties.forEach((property) => {
        it(property, async () => {
          const field = createField();
          delete field[property];

          stubDeps({
            fieldsFromFieldCaps: [field],
          });

          const { fields: resp } = await getFieldCapabilities(getArgsWithCallCluster());
          expect(resp).toHaveLength(1);
          expect(resp[0]).toHaveProperty(property);
          expect(resp[0][property]).not.toBe(footballs[0]);

          // ensure field object was not mutated
          expect(field).not.toHaveProperty(property);
          Object.keys(field).forEach((key) => {
            // ensure response field has original values from field
            expect(resp[0][key]).toBe(footballs[0]);
          });
        });
      });
    });
  });

  describe('overrides', () => {
    it('passes each field to `mergeOverrides()`', async () => {
      const fieldsFromFieldCaps = [{ name: 'foo' }, { name: 'bar' }, { name: 'baz' }];

      stubDeps({ fieldsFromFieldCaps });

      sinon.assert.notCalled(mergeOverrides);
      await getFieldCapabilities(getArgsWithCallCluster());
      sinon.assert.calledThrice(mergeOverrides);

      expect(mergeOverrides.args[0][0]).toHaveProperty('name', 'foo');
      expect(mergeOverrides.args[1][0]).toHaveProperty('name', 'bar');
      expect(mergeOverrides.args[2][0]).toHaveProperty('name', 'baz');
    });

    it('replaces field with return value', async () => {
      const fieldsFromFieldCaps = [
        { name: 'foo', bar: 1 },
        { name: 'baz', box: 2 },
      ];

      stubDeps({
        fieldsFromFieldCaps,
        mergeOverrides() {
          return { notFieldAnymore: 1 };
        },
      });

      expect((await getFieldCapabilities(getArgsWithCallCluster())).fields).toEqual([
        { notFieldAnymore: 1 },
        { notFieldAnymore: 1 },
      ]);
    });
  });
});
