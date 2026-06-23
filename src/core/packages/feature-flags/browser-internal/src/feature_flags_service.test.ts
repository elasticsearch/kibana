/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { firstValueFrom } from 'rxjs';
import type { Transaction } from '@elastic/apm-rum';
import { apm } from '@elastic/apm-rum';
import { type Client, OpenFeature, type Provider } from '@openfeature/web-sdk';
import { coreContextMock } from '@kbn/core-base-browser-mocks';
import type { FeatureFlagsSetup, FeatureFlagsStart } from '@kbn/core-feature-flags-browser';
import { httpServiceMock } from '@kbn/core-http-browser-mocks';
import type { HttpSetupMock } from '@kbn/core-http-browser-mocks';
import { injectedMetadataServiceMock } from '@kbn/core-injected-metadata-browser-mocks';
import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
import { FeatureFlagsService } from '..';

async function isSettledPromise(p: Promise<unknown>) {
  const immediateValue = {};
  const result = await Promise.race([p, immediateValue]);
  return result !== immediateValue;
}

describe('FeatureFlagsService Browser', () => {
  let featureFlagsService: FeatureFlagsService;
  let featureFlagsClient: Client;
  let injectedMetadata: jest.Mocked<InternalInjectedMetadataSetup>;
  let http: HttpSetupMock;

  const createSetupDeps = () => ({ http, injectedMetadata });

  beforeEach(() => {
    const getClientSpy = jest.spyOn(OpenFeature, 'getClient');
    featureFlagsService = new FeatureFlagsService(coreContextMock.create());
    featureFlagsClient = getClientSpy.mock.results[0].value;
    injectedMetadata = injectedMetadataServiceMock.createSetupContract();
    http = httpServiceMock.createSetupContract();
    http.post.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await featureFlagsService.stop();
    jest.clearAllMocks();
    await OpenFeature.clearProviders();
    await OpenFeature.clearContexts();
  });

  describe('provider handling', () => {
    test('appends a provider (without awaiting)', () => {
      expect.assertions(1);
      const { setProvider } = featureFlagsService.setup(createSetupDeps());
      const spy = jest.spyOn(OpenFeature, 'setProviderAndWait');
      const fakeProvider = { metadata: { name: 'fake provider' } } as Provider;
      setProvider(fakeProvider);
      expect(spy).toHaveBeenCalledWith(fakeProvider);
    });

    test('throws an error if called twice', () => {
      const { setProvider } = featureFlagsService.setup(createSetupDeps());
      const fakeProvider = { metadata: { name: 'fake provider' } } as Provider;
      setProvider(fakeProvider);
      expect(() => setProvider(fakeProvider)).toThrowErrorMatchingInlineSnapshot(
        `"A provider has already been set. This API cannot be called twice."`
      );
    });

    test('awaits initialization in the start context', async () => {
      const { setProvider } = featureFlagsService.setup(createSetupDeps());
      let externalResolve: Function = () => void 0;
      const spy = jest.spyOn(OpenFeature, 'setProviderAndWait').mockImplementationOnce(async () => {
        await new Promise((resolve) => {
          externalResolve = resolve;
        });
      });
      const fakeProvider = {} as Provider;
      setProvider(fakeProvider);
      expect(spy).toHaveBeenCalledWith(fakeProvider);
      const startPromise = featureFlagsService.start();
      await expect(isSettledPromise(startPromise)).resolves.toBe(false);
      externalResolve();
      await new Promise((resolve) => process.nextTick(resolve)); // Wait for the promise resolution to spread
      await expect(isSettledPromise(startPromise)).resolves.toBe(true);
    });

    test('do not hold for too long during initialization', async () => {
      const { setProvider } = featureFlagsService.setup(createSetupDeps());
      const spy = jest.spyOn(OpenFeature, 'setProviderAndWait').mockImplementationOnce(async () => {
        await new Promise(() => {}); // never resolves
      });
      const addLabelsMock = jest.fn();
      jest
        .spyOn(apm, 'getCurrentTransaction')
        // @ts-expect-error incomplete signature, but we don't care at this point
        .mockImplementationOnce(() => ({ addLabels: addLabelsMock }));
      const fakeProvider = {} as Provider;
      setProvider(fakeProvider);
      expect(spy).toHaveBeenCalledWith(fakeProvider);
      const startPromise = featureFlagsService.start();
      await expect(isSettledPromise(startPromise)).resolves.toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 2100)); // A bit longer than 2 seconds
      await expect(isSettledPromise(startPromise)).resolves.toBe(true);
      expect(addLabelsMock).toHaveBeenCalledWith({ slow_setup: true });
    });

    describe('APM instrumentation', () => {
      const fakeProvider = { metadata: { name: 'fake provider' } } as Provider;

      let setProvider: FeatureFlagsSetup['setProvider'];
      let apmSpy: jest.SpyInstance<Transaction | undefined>;
      let setProviderSpy: jest.SpyInstance<Promise<void>>;

      beforeEach(() => {
        const setup = featureFlagsService.setup(createSetupDeps());
        setProvider = setup.setProvider;
        setProviderSpy = jest.spyOn(OpenFeature, 'setProviderAndWait');
        apmSpy = jest.spyOn(apm, 'startTransaction');
      });

      test('starts an APM transaction to track the time it takes to set a provider', () => {
        expect.assertions(1);
        setProvider(fakeProvider);
        expect(apmSpy).toHaveBeenCalledWith('set-provider', 'feature-flags');
      });

      test('APM transaction tracks success', async () => {
        expect.assertions(4);

        setProviderSpy.mockResolvedValueOnce();
        setProvider(fakeProvider);

        const transaction = apmSpy.mock.results[0].value;
        const endTransactionSpy = jest.spyOn(transaction, 'end');
        expect(transaction.outcome).toBeUndefined();
        expect(endTransactionSpy).toHaveBeenCalledTimes(0);
        await setProviderSpy.mock.results[0].value.catch(() => {});
        expect(transaction.outcome).toBe('success');
        expect(endTransactionSpy).toHaveBeenCalledTimes(1);
      });

      test('APM transaction tracks failures', async () => {
        expect.assertions(5);

        const apmCaptureErrorSpy = jest.spyOn(apm, 'captureError');
        const error = new Error('Something went terribly wrong');
        setProviderSpy.mockRejectedValueOnce(error);
        setProvider(fakeProvider);

        const transaction = apmSpy.mock.results[0].value;
        const endTransactionSpy = jest.spyOn(transaction, 'end');
        expect(transaction.outcome).toBeUndefined();
        expect(endTransactionSpy).toHaveBeenCalledTimes(0);
        await setProviderSpy.mock.results[0].value.catch(() => {});
        expect(apmCaptureErrorSpy).toHaveBeenCalledWith(error);
        expect(transaction.outcome).toBe('failure');
        expect(endTransactionSpy).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('context handling', () => {
    let setContextSpy: jest.SpyInstance;

    beforeEach(() => {
      setContextSpy = jest.spyOn(OpenFeature, 'setContext');
    });

    test('appends context to the provider', async () => {
      const { appendContext } = featureFlagsService.setup(createSetupDeps());
      await appendContext({ kind: 'multi' });
      expect(setContextSpy).toHaveBeenCalledWith({ kind: 'multi' });
    });

    test('appends context to the provider (start method)', async () => {
      featureFlagsService.setup(createSetupDeps());
      const { appendContext } = await featureFlagsService.start();
      await appendContext({ kind: 'multi' });
      expect(setContextSpy).toHaveBeenCalledWith({ kind: 'multi' });
    });

    test('full multi context pass-through', async () => {
      const { appendContext } = featureFlagsService.setup(createSetupDeps());
      const context = {
        kind: 'multi' as const,
        kibana: {
          key: 'kibana-1',
        },
        organization: {
          key: 'organization-1',
        },
      };
      await appendContext(context);
      expect(setContextSpy).toHaveBeenCalledWith(context);
    });

    test('appends to the existing context', async () => {
      const { appendContext } = featureFlagsService.setup(createSetupDeps());
      const initialContext = {
        kind: 'multi' as const,
        kibana: {
          key: 'kibana-1',
        },
        organization: {
          key: 'organization-1',
        },
      };
      await appendContext(initialContext);
      expect(setContextSpy).toHaveBeenCalledWith(initialContext);

      await appendContext({ kind: 'multi', kibana: { has_data: true } });
      expect(setContextSpy).toHaveBeenCalledWith({
        ...initialContext,
        kibana: {
          ...initialContext.kibana,
          has_data: true,
        },
      });
    });

    test('converts single-contexts to multi-context', async () => {
      const { appendContext } = featureFlagsService.setup(createSetupDeps());
      await appendContext({ kind: 'organization', key: 'organization-1' });
      expect(setContextSpy).toHaveBeenCalledWith({
        kind: 'multi',
        organization: {
          key: 'organization-1',
        },
      });
    });

    test('if no `kind` provided, it defaults to the kibana context', async () => {
      const { appendContext } = featureFlagsService.setup(createSetupDeps());
      await appendContext({ key: 'key-1', has_data: false });
      expect(setContextSpy).toHaveBeenCalledWith({
        kind: 'multi',
        kibana: {
          key: 'key-1',
          has_data: false,
        },
      });
    });
  });

  describe('flag evaluation', () => {
    let startContract: FeatureFlagsStart;
    let apmSpy: jest.SpyInstance;
    let addHandlerSpy: jest.SpyInstance;

    beforeEach(async () => {
      addHandlerSpy = jest.spyOn(featureFlagsClient, 'addHandler');
      injectedMetadata.getFeatureFlags.mockReturnValue({
        overrides: {
          'my-overridden-flag': true,
          'myPlugin.myOverriddenFlag': true,
          myDestructuredObjPlugin: { myOverriddenFlag: true },
        },
        initialFeatureFlags: {},
      });
      featureFlagsService.setup(createSetupDeps());
      startContract = await featureFlagsService.start();
      apmSpy = jest.spyOn(apm, 'addLabels');
    });

    // We don't need to test the client, just our APIs, so testing that it returns the fallback value should be enough.
    test('get boolean flag', () => {
      const value = false;
      expect(startContract.getBooleanValue('my-flag', value)).toEqual(value);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-flag': value });
      expect(http.post).toHaveBeenCalledWith('/internal/feature-flags/my-flag/counter', {
        body: JSON.stringify({ value }),
      });
    });

    test('get string flag', () => {
      const value = 'my-default';
      expect(startContract.getStringValue('my-flag', value)).toEqual(value);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-flag': value });
      expect(http.post).toHaveBeenCalledWith('/internal/feature-flags/my-flag/counter', {
        body: JSON.stringify({ value }),
      });
    });

    test('get number flag', () => {
      const value = 42;
      expect(startContract.getNumberValue('my-flag', value)).toEqual(value);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-flag': value });
      expect(http.post).toHaveBeenCalledWith('/internal/feature-flags/my-flag/counter', {
        body: JSON.stringify({ value }),
      });
    });

    test('observe a boolean flag', async () => {
      const value = false;
      const flag$ = startContract.getBooleanValue$('my-flag', value);
      const observedValues: boolean[] = [];
      flag$.subscribe((v) => observedValues.push(v));
      // Initial emission
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-flag': value });
      expect(observedValues).toHaveLength(1);

      // Does not reevaluate and emit if the other flags are changed
      addHandlerSpy.mock.calls[0][1]({ flagsChanged: ['another-flag'] });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(1); // still 1

      // Reevaluates and emits when the observed flag is changed
      addHandlerSpy.mock.calls[0][1]({ flagsChanged: ['my-flag'] });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(2);

      // Reevaluates and emits when the context is changed
      await startContract.appendContext({ kind: 'multi', kibana: { key: 'kibana-2' } });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(3);
    });

    test('observe a string flag', async () => {
      const value = 'my-value';
      const flag$ = startContract.getStringValue$('my-flag', value);
      const observedValues: string[] = [];
      flag$.subscribe((v) => observedValues.push(v));
      // Initial emission
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-flag': value });
      expect(observedValues).toHaveLength(1);

      // Does not reevaluate and emit if the other flags are changed
      addHandlerSpy.mock.calls[0][1]({ flagsChanged: ['another-flag'] });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(1); // still 1

      // Reevaluates and emits when the observed flag is changed
      addHandlerSpy.mock.calls[0][1]({ flagsChanged: ['my-flag'] });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(2);

      // Reevaluates and emits when the context is changed
      await startContract.appendContext({ kind: 'multi', kibana: { key: 'kibana-2' } });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(3);
    });

    test('observe a number flag', async () => {
      const value = 42;
      const flag$ = startContract.getNumberValue$('my-flag', value);
      const observedValues: number[] = [];
      flag$.subscribe((v) => observedValues.push(v));
      // Initial emission
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-flag': value });
      expect(observedValues).toHaveLength(1);

      // Does not reevaluate and emit if the other flags are changed
      addHandlerSpy.mock.calls[0][1]({ flagsChanged: ['another-flag'] });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(1); // still 1

      // Reevaluates and emits when the observed flag is changed
      addHandlerSpy.mock.calls[0][1]({ flagsChanged: ['my-flag'] });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(2);

      // Reevaluates and emits when the context is changed
      await startContract.appendContext({ kind: 'multi', kibana: { key: 'kibana-2' } });
      await expect(firstValueFrom(flag$)).resolves.toEqual(value);
      expect(observedValues).toHaveLength(3);
    });

    test('with overrides', async () => {
      const getBooleanValueSpy = jest.spyOn(featureFlagsClient, 'getBooleanValue');
      expect(startContract.getBooleanValue('my-overridden-flag', false)).toEqual(true);
      expect(apmSpy).toHaveBeenCalledWith({ 'flag_my-overridden-flag': true });
      expect(http.post).toHaveBeenCalledWith('/internal/feature-flags/my-overridden-flag/counter', {
        body: JSON.stringify({ value: true }),
      });
      expect(getBooleanValueSpy).not.toHaveBeenCalled();

      // Only to prove the spy works
      expect(startContract.getBooleanValue('another-flag', false)).toEqual(false);
      expect(getBooleanValueSpy).toHaveBeenCalledTimes(1);
      expect(getBooleanValueSpy).toHaveBeenCalledWith('another-flag', false);
      expect(http.post).toHaveBeenCalledWith('/internal/feature-flags/another-flag/counter', {
        body: JSON.stringify({ value: false }),
      });
    });

    test('overrides with dotted names', async () => {
      const getBooleanValueSpy = jest.spyOn(featureFlagsClient, 'getBooleanValue');
      expect(startContract.getBooleanValue('myPlugin.myOverriddenFlag', false)).toEqual(true);
      expect(
        startContract.getBooleanValue('myDestructuredObjPlugin.myOverriddenFlag', false)
      ).toEqual(true);
      expect(getBooleanValueSpy).not.toHaveBeenCalled();
    });
  });
});
