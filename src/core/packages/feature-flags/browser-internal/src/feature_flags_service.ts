/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreContext } from '@kbn/core-base-browser-internal';
import type { InternalHttpSetup } from '@kbn/core-http-browser-internal';
import type { InternalInjectedMetadataSetup } from '@kbn/core-injected-metadata-browser-internal';
import type { Logger } from '@kbn/logging';
import type {
  EvaluationContext,
  FeatureFlagsSetup,
  FeatureFlagsStart,
  MultiContextEvaluationContext,
} from '@kbn/core-feature-flags-browser';
import { apm } from '@elastic/apm-rum';
import { type Client, ClientProviderEvents, OpenFeature } from '@openfeature/web-sdk';
import deepMerge from 'deepmerge';
import { filter, map, merge, startWith, Subject } from 'rxjs';
import { get } from 'lodash';
import { buildPath } from '@kbn/core-http-browser';

/**
 * setup method dependencies
 * @internal
 */
export interface FeatureFlagsSetupDeps {
  /**
   * Used to hit the counter endpoint.
   */
  http: InternalHttpSetup;
  /**
   * Used to read the flag overrides set up in the configuration file.
   */
  injectedMetadata: InternalInjectedMetadataSetup;
}

/**
 * The browser-side Feature Flags Service
 * @internal
 */
export class FeatureFlagsService {
  private readonly featureFlagsClient: Client;
  private readonly logger: Logger;
  private readonly contextChanged$ = new Subject<void>();
  private isProviderReadyPromise?: Promise<void>;
  private context: MultiContextEvaluationContext = { kind: 'multi' };
  private overrides: Record<string, unknown> = {};
  private http?: InternalHttpSetup;

  /**
   * The core service's constructor
   * @param core {@link CoreContext}
   */
  constructor(core: CoreContext) {
    this.logger = core.logger.get('feature-flags-service');
    this.featureFlagsClient = OpenFeature.getClient();
    OpenFeature.setLogger(this.logger.get('open-feature'));
  }

  /**
   * Setup lifecycle method
   * @param deps {@link FeatureFlagsSetup} including the {@link InternalInjectedMetadataSetup} used to retrieve the feature flags.
   */
  public setup(deps: FeatureFlagsSetupDeps): FeatureFlagsSetup {
    const featureFlagsInjectedMetadata = deps.injectedMetadata.getFeatureFlags();
    if (featureFlagsInjectedMetadata) {
      this.overrides = featureFlagsInjectedMetadata.overrides;
    }
    this.http = deps.http;
    return {
      getInitialFeatureFlags: () => featureFlagsInjectedMetadata?.initialFeatureFlags ?? {},
      setProvider: (provider) => {
        if (this.isProviderReadyPromise) {
          throw new Error('A provider has already been set. This API cannot be called twice.');
        }
        const transaction = apm.startTransaction('set-provider', 'feature-flags');
        this.isProviderReadyPromise = OpenFeature.setProviderAndWait(provider);
        this.isProviderReadyPromise
          .then(() => {
            if (transaction) {
              // @ts-expect-error RUM types are not correct
              transaction.outcome = 'success';
              transaction.end();
            }
          })
          .catch((err) => {
            this.logger.error(err);
            apm.captureError(err);
            if (transaction) {
              // @ts-expect-error RUM types are not correct
              transaction.outcome = 'failure';
              transaction.end();
            }
          });
      },
      appendContext: (contextToAppend) => this.appendContext(contextToAppend),
    };
  }

  /**
   * Start lifecycle method
   */
  public async start(): Promise<FeatureFlagsStart> {
    const featureFlagsChanged$ = new Subject<string[]>();
    this.featureFlagsClient.addHandler(ClientProviderEvents.ConfigurationChanged, (event) => {
      if (event?.flagsChanged) {
        featureFlagsChanged$.next(event.flagsChanged);
      }
    });
    const observeFeatureFlag$ = (flagName: string) =>
      merge(
        // Flag changes
        featureFlagsChanged$,
        // Context changes (we need to reevaluate)
        this.contextChanged$.pipe(map(() => [flagName]))
      ).pipe(
        filter((flagNames) => flagNames.includes(flagName)),
        startWith([flagName]) // only to emit on the first call
      );

    await this.waitForProviderInitialization();

    return {
      appendContext: (contextToAppend) => this.appendContext(contextToAppend),
      getBooleanValue: (flagName: string, fallbackValue: boolean) =>
        this.evaluateFlag(this.featureFlagsClient.getBooleanValue, flagName, fallbackValue),
      getStringValue: <Value extends string>(flagName: string, fallbackValue: Value) =>
        this.evaluateFlag<Value>(this.featureFlagsClient.getStringValue, flagName, fallbackValue),
      getNumberValue: <Value extends number>(flagName: string, fallbackValue: Value) =>
        this.evaluateFlag<Value>(this.featureFlagsClient.getNumberValue, flagName, fallbackValue),
      getBooleanValue$: (flagName, fallbackValue) => {
        return observeFeatureFlag$(flagName).pipe(
          map(() =>
            this.evaluateFlag(this.featureFlagsClient.getBooleanValue, flagName, fallbackValue)
          )
        );
      },
      getStringValue$: <Value extends string>(flagName: string, fallbackValue: Value) => {
        return observeFeatureFlag$(flagName).pipe(
          map(() =>
            this.evaluateFlag<Value>(
              this.featureFlagsClient.getStringValue,
              flagName,
              fallbackValue
            )
          )
        );
      },
      getNumberValue$: <Value extends number>(flagName: string, fallbackValue: Value) => {
        return observeFeatureFlag$(flagName).pipe(
          map(() =>
            this.evaluateFlag<Value>(
              this.featureFlagsClient.getNumberValue,
              flagName,
              fallbackValue
            )
          )
        );
      },
    };
  }

  /**
   * Stop lifecycle method
   */
  public async stop() {
    await OpenFeature.close();
  }

  /**
   * Waits for the provider initialization with a timeout to avoid holding the page load for too long
   * @internal
   */
  private async waitForProviderInitialization() {
    // Adding a timeout here to avoid hanging the start for too long if the provider is unresponsive
    let timeoutId: NodeJS.Timeout | undefined;
    await Promise.race([
      this.isProviderReadyPromise,
      new Promise((resolve) => {
        timeoutId = setTimeout(resolve, 2 * 1000);
      }).then(() => {
        const msg = `The feature flags provider took too long to initialize.
        Won't hold the page load any longer.
        Feature flags will return the provided fallbacks until the provider is eventually initialized.`;
        this.logger.warn(msg);
        // Flag the transaction as slow so that we can quantify how often it happens
        apm.getCurrentTransaction()?.addLabels({ slow_setup: true });
      }),
    ]);
    clearTimeout(timeoutId);
  }

  /**
   * Wrapper to evaluate flags with the common config overrides interceptions + APM and counters reporting
   * @param evaluationFn The actual evaluation API
   * @param flagName The name of the flag to evaluate
   * @param fallbackValue The fallback value
   * @internal
   */
  private evaluateFlag<T extends string | boolean | number>(
    evaluationFn: (flagName: string, fallbackValue: T) => T,
    flagName: string,
    fallbackValue: T
  ): T {
    const override = get(this.overrides, flagName); // using lodash get because flagName can come with dots and the config parser might structure it in objects.
    const value =
      typeof override !== 'undefined'
        ? (override as T)
        : // We have to bind the evaluation or the client will lose its internal context
          evaluationFn.bind(this.featureFlagsClient)(flagName, fallbackValue);
    apm.addLabels({ [`flag_${flagName.replaceAll('.', '_')}`]: value });

    // Increment usage counter
    // TODO: When UI has OTel instrumented, we can increment the counter in the browser directly.
    this.http
      ?.post(buildPath('/internal/feature-flags/{flagName}/counter', { flagName }), {
        body: JSON.stringify({ value }),
      })
      .catch();

    return value;
  }

  /**
   * Formats the provided context to fulfill the expected multi-context structure.
   * @param contextToAppend The {@link EvaluationContext} to append.
   * @internal
   */
  private async appendContext(contextToAppend: EvaluationContext): Promise<void> {
    // If no kind provided, default to the project|deployment level.
    const { kind = 'kibana', ...rest } = contextToAppend;
    // Format the context to fulfill the expected multi-context structure
    const formattedContextToAppend: MultiContextEvaluationContext =
      kind === 'multi'
        ? (contextToAppend as MultiContextEvaluationContext)
        : { kind: 'multi', [kind]: rest };

    // Merge the formatted context to append to the global context, and set it in the OpenFeature client.
    this.context = deepMerge(this.context, formattedContextToAppend);
    await OpenFeature.setContext(this.context);
    this.contextChanged$.next();
  }
}
