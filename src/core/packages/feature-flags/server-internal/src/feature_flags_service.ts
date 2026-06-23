/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreContext } from '@kbn/core-base-server-internal';
import type {
  EvaluationContext,
  FeatureFlagsSetup,
  FeatureFlagsStart,
  MultiContextEvaluationContext,
} from '@kbn/core-feature-flags-server';
import type { Logger } from '@kbn/logging';
import { addSpanLabels } from '@kbn/apm-utils';
import { getFlattenedObject } from '@kbn/std';
import {
  type Client,
  OpenFeature,
  ServerProviderEvents,
  NOOP_PROVIDER,
} from '@openfeature/server-sdk';
import deepMerge from 'deepmerge';
import {
  filter,
  switchMap,
  startWith,
  Subject,
  BehaviorSubject,
  pairwise,
  takeUntil,
  merge,
  map,
} from 'rxjs';
import { get } from 'lodash';
import type { InitialFeatureFlagsGetter } from '@kbn/core-feature-flags-server/src/contracts';
import type { InternalHttpServiceSetup } from '@kbn/core-http-server-internal';
import { schema } from '@kbn/config-schema';
import { createOpenFeatureLogger } from './create_open_feature_logger';
import { setProviderWithRetries } from './set_provider_with_retries';
import { type FeatureFlagsConfig, featureFlagsConfig } from './feature_flags_config';
import { incrementCounter } from './increment_counter';

/**
 * Core-internal contract for the setup lifecycle step.
 * @internal
 */
export interface InternalFeatureFlagsSetup extends FeatureFlagsSetup {
  /**
   * Used by the rendering service to share the overrides with the service on the browser side.
   */
  getOverrides: () => Record<string, unknown>;
  /**
   * Required to bootstrap the browser-side OpenFeature client with a seed of the feature flags for faster load-times
   * and to work-around air-gapped environments.
   */
  getInitialFeatureFlags: () => Promise<Record<string, unknown>>;
}

export interface FeatureFlagsSetupDeps {
  http: InternalHttpServiceSetup;
}

/**
 * The server-side Feature Flags Service
 * @internal
 */
export class FeatureFlagsService {
  private readonly featureFlagsClient: Client;
  private readonly logger: Logger;
  private readonly stop$ = new Subject<void>();
  private readonly overrides$ = new BehaviorSubject<Record<string, unknown>>({});
  private readonly contextChanged$ = new Subject<void>();
  private context: MultiContextEvaluationContext = { kind: 'multi' };
  private initialFeatureFlagsGetter: InitialFeatureFlagsGetter = async () => ({});

  /**
   * The core service's constructor
   * @param core {@link CoreContext}
   */
  constructor(private readonly core: CoreContext) {
    this.logger = core.logger.get('feature-flags-service');
    this.featureFlagsClient = OpenFeature.getClient();
    OpenFeature.setLogger(createOpenFeatureLogger(this.logger.get('open-feature')));
  }

  /**
   * Setup lifecycle method
   */
  public setup({ http }: FeatureFlagsSetupDeps): InternalFeatureFlagsSetup {
    // Register "overrides" to be changed via the dynamic config endpoint (enabled in test environments only)
    this.core.configService.addDynamicConfigPaths(featureFlagsConfig.path, ['overrides']);

    this.core.configService
      .atPath<FeatureFlagsConfig>(featureFlagsConfig.path)
      .subscribe(({ overrides = {} }) => {
        this.overrides$.next(getFlattenedObject(overrides));
      });

    this.registerCounterRoute(http);

    return {
      getOverrides: () => this.overrides$.value,
      getInitialFeatureFlags: () => this.initialFeatureFlagsGetter(),
      setInitialFeatureFlagsGetter: (getter: InitialFeatureFlagsGetter) => {
        this.initialFeatureFlagsGetter = getter;
      },
      setProvider: (provider) => {
        if (OpenFeature.providerMetadata !== NOOP_PROVIDER.metadata) {
          throw new Error('A provider has already been set. This API cannot be called twice.');
        }
        setProviderWithRetries(provider, this.logger);
      },
      appendContext: (contextToAppend) => this.appendContext(contextToAppend),
    };
  }

  /**
   * Start lifecycle method
   */
  public start(): FeatureFlagsStart {
    const featureFlagsChanged$ = new Subject<string[]>();
    this.featureFlagsClient.addHandler(ServerProviderEvents.ConfigurationChanged, (event) => {
      if (event?.flagsChanged) {
        featureFlagsChanged$.next(event.flagsChanged);
      }
    });
    this.overrides$.pipe(pairwise()).subscribe(([prev, next]) => {
      const mergedObject = { ...prev, ...next };
      const keys = Object.keys(mergedObject).filter(
        // Keep only the keys that have been removed or changed
        (key) => !Object.hasOwn(next, key) || next[key] !== prev[key]
      );
      featureFlagsChanged$.next(keys);
    });
    const observeFeatureFlag$ = (flagName: string) =>
      merge(
        // Flag changes
        featureFlagsChanged$,
        // Context changes (we need to reevaluate)
        this.contextChanged$.pipe(map(() => [flagName]))
      ).pipe(
        filter((flagNames) => flagNames.includes(flagName)),
        startWith([flagName]), // only to emit on the first call
        takeUntil(this.stop$) // stop the observable when the service stops
      );

    return {
      appendContext: (contextToAppend) => this.appendContext(contextToAppend),
      getBooleanValue: async (flagName, fallbackValue) =>
        this.evaluateFlag(this.featureFlagsClient.getBooleanValue, flagName, fallbackValue),
      getStringValue: async <Value extends string>(flagName: string, fallbackValue: Value) =>
        await this.evaluateFlag<Value>(
          this.featureFlagsClient.getStringValue,
          flagName,
          fallbackValue
        ),
      getNumberValue: async <Value extends number>(flagName: string, fallbackValue: Value) =>
        await this.evaluateFlag<Value>(
          this.featureFlagsClient.getNumberValue,
          flagName,
          fallbackValue
        ),
      getBooleanValue$: (flagName, fallbackValue) => {
        return observeFeatureFlag$(flagName).pipe(
          switchMap(() =>
            this.evaluateFlag(this.featureFlagsClient.getBooleanValue, flagName, fallbackValue)
          )
        );
      },
      getStringValue$: <Value extends string>(flagName: string, fallbackValue: Value) => {
        return observeFeatureFlag$(flagName).pipe(
          switchMap(() =>
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
          switchMap(() =>
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
    this.overrides$.complete();
    this.stop$.next();
    this.stop$.complete();
  }

  /**
   * Wrapper to evaluate flags with the common config overrides interceptions + APM and counters reporting
   * @param evaluationFn The actual evaluation API
   * @param flagName The name of the flag to evaluate
   * @param fallbackValue The fallback value
   * @internal
   */
  private async evaluateFlag<T extends string | boolean | number>(
    evaluationFn: (flagName: string, fallbackValue: T) => Promise<T>,
    flagName: string,
    fallbackValue: T
  ): Promise<T> {
    const override = get(this.overrides$.value, flagName); // using lodash get because flagName can come with dots and the config parser might structure it in objects.
    const value =
      typeof override !== 'undefined'
        ? (override as T)
        : // We have to bind the evaluation or the client will lose its internal context
          await evaluationFn.bind(this.featureFlagsClient)(flagName, fallbackValue);
    addSpanLabels({ [`flag_${flagName.replaceAll('.', '_')}`]: value });

    // Report the counter for the flag evaluation.
    incrementCounter(flagName, value);

    return value;
  }

  /**
   * Formats the provided context to fulfill the expected multi-context structure.
   * @param contextToAppend The {@link EvaluationContext} to append.
   * @internal
   */
  private appendContext(contextToAppend: EvaluationContext): void {
    // If no kind provided, default to the project|deployment level.
    const { kind = 'kibana', ...rest } = contextToAppend;
    // Format the context to fulfill the expected multi-context structure
    const formattedContextToAppend: MultiContextEvaluationContext =
      kind === 'multi'
        ? (contextToAppend as MultiContextEvaluationContext)
        : { kind: 'multi', [kind]: rest };

    // Merge the formatted context to append to the global context, and set it in the OpenFeature client.
    this.context = deepMerge(this.context, formattedContextToAppend);
    OpenFeature.setContext(this.context);
    this.contextChanged$.next();
  }

  private registerCounterRoute(http: InternalHttpServiceSetup): void {
    http.createRouter('').post(
      {
        path: '/internal/feature-flags/{flagName}/counter',
        validate: {
          params: schema.object({
            flagName: schema.string({ minLength: 1, maxLength: 255 }),
          }),
          body: schema.object({
            value: schema.oneOf([
              schema.boolean(),
              schema.number(),
              schema.string({ maxLength: 5000 }),
            ]),
          }),
        },
        security: {
          authz: {
            enabled: false,
            reason: 'Any authenticated user should have access to the configuration',
          },
          authc: {
            enabled: true,
          },
        },
        options: {
          access: 'internal',
        },
      },
      (context, request, response) => {
        const { flagName } = request.params;
        const { value } = request.body;
        incrementCounter(flagName, value);
        return response.accepted();
      }
    );
  }
}
