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

import { convertEsError } from './errors';
import * as convertEsErrorNS from './errors';

import { callIndexAliasApi, callFieldCapsApi } from './es_api';

describe('server/index_patterns/service/lib/es_api', () => {
  describe('#callIndexAliasApi()', () => {
    let sandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it('calls indices.getAlias() via callCluster', async () => {
      const getAlias = sinon.stub();
      const callCluster = {
        indices: {
          getAlias,
        },
        fieldCaps: sinon.stub(),
      };

      await callIndexAliasApi(callCluster);
      sinon.assert.calledOnce(getAlias);
    });

    it('passes indices directly to es api', async () => {
      const football = {};
      const getAlias = sinon.stub();
      const callCluster = {
        indices: {
          getAlias,
        },
        fieldCaps: sinon.stub(),
      };
      await callIndexAliasApi(callCluster, football);
      sinon.assert.calledOnce(getAlias);
      expect(getAlias.args[0][0].index).toBe(football);
    });

    it('returns the es response directly', async () => {
      const football = {};
      const getAlias = sinon.stub().returns(football);
      const callCluster = {
        indices: {
          getAlias,
        },
        fieldCaps: sinon.stub(),
      };
      const resp = await callIndexAliasApi(callCluster);
      sinon.assert.calledOnce(getAlias);
      expect(resp).toBe(football);
    });

    it('sets ignore_unavailable and allow_no_indices params', async () => {
      const getAlias = sinon.stub();
      const callCluster = {
        indices: {
          getAlias,
        },
        fieldCaps: sinon.stub(),
      };
      await callIndexAliasApi(callCluster);
      sinon.assert.calledOnce(getAlias);

      const passedOpts = getAlias.args[0][0];
      expect(passedOpts).toHaveProperty('ignore_unavailable', true);
      expect(passedOpts).toHaveProperty('allow_no_indices', false);
    });

    it('handles errors with convertEsError()', async () => {
      const indices = [];
      const esError = new Error('esError');
      const convertedError = new Error('convertedError');

      sandbox.stub(convertEsErrorNS, 'convertEsError').throws(convertedError);
      const getAlias = sinon.stub(async () => {
        throw esError;
      });
      const callCluster = {
        indices: {
          getAlias,
        },
        fieldCaps: sinon.stub(),
      };
      try {
        await callIndexAliasApi(callCluster, indices);
        throw new Error('expected callIndexAliasApi() to throw');
      } catch (error) {
        expect(error).toBe(convertedError);
        sinon.assert.calledOnce(convertEsError);
        expect(convertEsError.args[0][0]).toBe(indices);
        expect(convertEsError.args[0][1]).toBe(esError);
      }
    });
  });

  describe('#callFieldCapsApi()', () => {
    let sandbox;
    beforeEach(() => (sandbox = sinon.createSandbox()));
    afterEach(() => sandbox.restore());

    it('calls fieldCaps() via callCluster', async () => {
      const fieldCaps = sinon.stub();
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      await callFieldCapsApi({ callCluster });
      sinon.assert.calledOnce(fieldCaps);
    });

    it('passes indices directly to es api', async () => {
      const indices = ['indexA', 'indexB'];
      const fieldCaps = sinon.stub();
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      await callFieldCapsApi({ callCluster, indices });
      sinon.assert.calledOnce(fieldCaps);
      expect(fieldCaps.args[0][0].index).toBe(indices);
    });

    it('returns the es response directly', async () => {
      const football = {};
      const fieldCaps = sinon.stub().returns(football);
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      const resp = await callFieldCapsApi({ callCluster });
      sinon.assert.calledOnce(fieldCaps);
      expect(resp).toBe(football);
    });

    it('batches field caps requests whose encoded index path exceeds the safe limit', async () => {
      const indices = [`index-${'a'.repeat(1600)}`, `index-${'b'.repeat(1600)}`];
      const fieldCaps = sinon.stub();
      fieldCaps.onFirstCall().resolves({ body: { indices: ['index-a'], fields: {} } });
      fieldCaps.onSecondCall().resolves({ body: { indices: ['index-b'], fields: {} } });
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };

      await callFieldCapsApi({ callCluster, indices });

      sinon.assert.calledTwice(fieldCaps);
      expect(fieldCaps.firstCall.args[0].index).toEqual([indices[0]]);
      expect(fieldCaps.secondCall.args[0].index).toEqual([indices[1]]);
    });

    it('uses the first transport wrapper with the merged response body', async () => {
      const indices = [`index-${'a'.repeat(1600)}`, `index-${'b'.repeat(1600)}`];
      const meta = { requestId: 'first-request' };
      const fieldCaps = sinon.stub();
      fieldCaps.onFirstCall().resolves({
        body: { indices: ['index-a'], fields: {} },
        statusCode: 200,
        headers: { 'x-test': 'first' },
        warnings: null,
        meta,
      });
      fieldCaps.onSecondCall().resolves({
        body: { indices: ['index-b'], fields: {} },
        statusCode: 200,
        headers: { 'x-test': 'second' },
        warnings: null,
        meta: { requestId: 'second-request' },
      });
      const callCluster = { fieldCaps };

      const response = await callFieldCapsApi({ callCluster, indices });

      expect(response).toEqual({
        body: { indices: ['index-a', 'index-b'], fields: {} },
        statusCode: 200,
        headers: { 'x-test': 'first' },
        warnings: null,
        meta,
      });
      expect(response.meta).toBe(meta);
    });

    it('batches comma-separated index strings without rewriting their entries', async () => {
      const firstIndex = `first-${'a'.repeat(1600)}`;
      const secondIndex = `second-${'b'.repeat(1600)}`;
      const indices = `${firstIndex},${secondIndex}`;
      const fieldCaps = sinon.stub().resolves({ body: { indices: [], fields: {} } });
      const callCluster = { fieldCaps };

      await callFieldCapsApi({ callCluster, indices });

      sinon.assert.calledTwice(fieldCaps);
      expect(fieldCaps.firstCall.args[0].index).toEqual([firstIndex]);
      expect(fieldCaps.secondCall.args[0].index).toEqual([secondIndex]);
    });

    it('budgets interspersed exclusions and preserves expression order within batches', async () => {
      const positives = [
        `first-${'a'.repeat(1250)}`,
        `second-${'b'.repeat(1250)}`,
        `third-${'c'.repeat(1250)}`,
      ];
      const negatives = [
        `-first-exclusion-${'x'.repeat(300)}`,
        `-second-exclusion-${'y'.repeat(300)}`,
      ];
      const indices = [positives[0], negatives[0], positives[1], negatives[1], positives[2]].join(
        ','
      );
      const fieldCaps = sinon.stub().resolves({ body: { indices: [], fields: {} } });
      const callCluster = { fieldCaps };

      await callFieldCapsApi({ callCluster, indices });

      sinon.assert.calledThrice(fieldCaps);
      fieldCaps.getCalls().forEach((call, index) => {
        expect(call.args[0].index).toEqual([positives[index], ...negatives]);
        expect(encodeURIComponent(call.args[0].index.join(',')).length).toBeLessThanOrEqual(3000);
      });
    });

    it('uses encoded URL length when batching Unicode index names', async () => {
      const indices = [`first-${'é'.repeat(300)}`, `second-${'é'.repeat(300)}`];
      const fieldCaps = sinon.stub().resolves({ body: { indices: [], fields: {} } });
      const callCluster = { fieldCaps };

      await callFieldCapsApi({ callCluster, indices });

      sinon.assert.calledTwice(fieldCaps);
    });

    it('includes every positive once and repeats every negative in each batch', async () => {
      const positives = [`first-${'a'.repeat(1500)}`, `second-${'b'.repeat(1500)}`];
      const negatives = ['-excluded-a', '-excluded-b'];
      const fieldCaps = sinon.stub().resolves({ body: { indices: [], fields: {} } });
      const callCluster = { fieldCaps };

      await callFieldCapsApi({ callCluster, indices: [...positives, ...negatives] });

      sinon.assert.calledTwice(fieldCaps);
      expect(fieldCaps.firstCall.args[0].index).toEqual([positives[0], ...negatives]);
      expect(fieldCaps.secondCall.args[0].index).toEqual([positives[1], ...negatives]);
    });

    it('forwards all request and transport options to every batch', async () => {
      const indices = [`first-${'a'.repeat(1500)}`, `second-${'b'.repeat(1500)}`];
      const indexFilter = { term: { status: 'active' } };
      const runtimeMappings = { runtime_field: { type: 'keyword' } };
      const abortSignal = new AbortController().signal;
      const fieldCaps = sinon.stub().resolves({ body: { indices: [], fields: {} } });
      const callCluster = { fieldCaps };

      await callFieldCapsApi({
        callCluster,
        indices,
        indexFilter,
        fieldCapsOptions: { allow_no_indices: true, include_unmapped: false },
        fields: ['field-a'],
        expandWildcards: ['open', 'hidden'],
        fieldTypes: ['keyword'],
        includeEmptyFields: false,
        runtimeMappings,
        abortSignal,
        projectRouting: 'project-id',
      });

      for (const call of fieldCaps.getCalls()) {
        expect(call.args[0]).toEqual(
          expect.objectContaining({
            fields: ['field-a'],
            ignore_unavailable: true,
            index_filter: indexFilter,
            expand_wildcards: ['open', 'hidden'],
            types: ['keyword'],
            include_empty_fields: false,
            runtime_mappings: runtimeMappings,
            project_routing: 'project-id',
            allow_no_indices: true,
            include_unmapped: true,
          })
        );
        expect(call.args[1]).toEqual({ meta: true, signal: abortSignal });
      }
    });

    it.each([
      {
        indices: ['-one', `-${'a'.repeat(3100)}`],
        description: 'an all-negative array',
      },
      {
        indices: `-${'a'.repeat(3100)},-${'b'.repeat(10)}`,
        description: 'an all-negative string',
      },
      {
        indices: [`index-${'a'.repeat(3100)}`, 'short-index'],
        description: 'an indivisible oversized positive',
      },
    ])('preserves the single request path for $description', async ({ indices }) => {
      const response = { body: { indices: [], fields: {} } };
      const fieldCaps = sinon.stub().resolves(response);
      const callCluster = { fieldCaps };

      const result = await callFieldCapsApi({ callCluster, indices });

      sinon.assert.calledOnce(fieldCaps);
      expect(fieldCaps.firstCall.args[0].index).toBe(indices);
      expect(result).toBe(response);
    });

    it('runs batches sequentially', async () => {
      const indices = [`first-${'a'.repeat(1600)}`, `second-${'b'.repeat(1600)}`];
      let resolveFirst;
      const firstResponse = new Promise((resolve) => {
        resolveFirst = resolve;
      });
      const fieldCaps = sinon.stub();
      fieldCaps.onFirstCall().returns(firstResponse);
      fieldCaps.onSecondCall().resolves({ body: { indices: [], fields: {} } });
      const callCluster = { fieldCaps };

      const request = callFieldCapsApi({ callCluster, indices });
      await Promise.resolve();
      sinon.assert.calledOnce(fieldCaps);

      resolveFirst({ body: { indices: [], fields: {} } });
      await request;
      sinon.assert.calledTwice(fieldCaps);
    });

    it('converts a batched request error using the original logical indices', async () => {
      const indices = [`first-${'a'.repeat(1600)}`, `second-${'b'.repeat(1600)}`];
      const esError = new Error('esError');
      const convertedError = new Error('convertedError');
      sandbox.stub(convertEsErrorNS, 'convertEsError').throws(convertedError);
      const fieldCaps = sinon.stub();
      fieldCaps.onFirstCall().resolves({ body: { indices: [], fields: {} } });
      fieldCaps.onSecondCall().rejects(esError);
      const callCluster = { fieldCaps };

      await expect(callFieldCapsApi({ callCluster, indices })).rejects.toBe(convertedError);
      sinon.assert.calledWithExactly(convertEsError, indices, esError);
    });

    it.each(['index_closed_exception', 'cluster_block_exception'])(
      'returns an empty response when a batch fails with %s',
      async (errorName) => {
        const indices = [`first-${'a'.repeat(1600)}`, `second-${'b'.repeat(1600)}`];
        const fieldCaps = sinon.stub();
        fieldCaps.onFirstCall().resolves({ body: { indices: [], fields: {} } });
        fieldCaps.onSecondCall().rejects(new Error(`${errorName}: unavailable`));
        const callCluster = { fieldCaps };

        await expect(callFieldCapsApi({ callCluster, indices })).resolves.toEqual({
          body: { indices: [], fields: {} },
        });
      }
    );

    it('sets ignore_unavailable, allow_no_indices, and fields params', async () => {
      const fieldCaps = sinon.stub();
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      await callFieldCapsApi({ callCluster });
      sinon.assert.calledOnce(fieldCaps);

      const passedOpts = fieldCaps.args[0][0];
      expect(passedOpts).toHaveProperty('fields', ['*']);
      expect(passedOpts).toHaveProperty('ignore_unavailable', true);
      expect(passedOpts).toHaveProperty('allow_no_indices', false);
    });

    it('handles errors with convertEsError()', async () => {
      const indices = [];
      const esError = new Error('esError');
      const convertedError = new Error('convertedError');

      sandbox.stub(convertEsErrorNS, 'convertEsError').throws(convertedError);
      const fieldCaps = sinon.spy(async () => {
        throw esError;
      });
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      try {
        await callFieldCapsApi({ callCluster, indices });
        throw new Error('expected callFieldCapsApi() to throw');
      } catch (error) {
        expect(error).toBe(convertedError);
        sinon.assert.calledOnce(convertEsError);
        expect(convertEsError.args[0][0]).toBe(indices);
        expect(convertEsError.args[0][1]).toBe(esError);
      }
    });

    it('passes projectRouting to es api when provided', async () => {
      const projectRouting = 'test-project-id';
      const fieldCaps = sinon.stub();
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      await callFieldCapsApi({ callCluster, projectRouting });
      sinon.assert.calledOnce(fieldCaps);

      const passedOpts = fieldCaps.args[0][0];
      expect(passedOpts).toHaveProperty('project_routing', projectRouting);
    });

    it('does not include project_routing when not provided', async () => {
      const fieldCaps = sinon.stub();
      const callCluster = {
        indices: {
          getAlias: sinon.stub(),
        },
        fieldCaps,
      };
      await callFieldCapsApi({ callCluster });
      sinon.assert.calledOnce(fieldCaps);

      const passedOpts = fieldCaps.args[0][0];
      expect(passedOpts).not.toHaveProperty('project_routing');
    });
  });
});
