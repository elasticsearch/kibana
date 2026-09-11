/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  type BindingActivation,
  type BindInWhenOnFluentSyntax,
  type BindToFluentSyntax,
  type BindWhenOnFluentSyntax,
  type Container,
  ContainerModule,
  type ContainerModuleLoadOptions,
  type DynamicValueBuilder,
  type Factory,
  type GetAllOptions,
  type GetOptions,
  LazyServiceIdentifier,
  type MapToResolvedValueInjectOptions,
  type ResolutionContext,
  type ResolvedValueInjectOptions,
  type ServiceIdentifier,
} from 'inversify';
import { once, wrap } from 'lodash';
import { OnSetup, OnStart } from './services/plugin';

/**
 * Extended container module options providing Kibana-specific features.
 * @public
 */
export interface KibanaContainerModuleLoadOptions extends ContainerModuleLoadOptions {
  /**
   * An extended binding supporting Kibana-specific features.
   */
  bind: KibanaBind;

  /**
   * Registers a handler that will be called after the service activation.
   * @param serviceIdentifier The service identifier to register the handler to.
   * @param activation The handler to perform an action with the service instance.
   */
  onActivation<T>(
    serviceIdentifier: ServiceIdentifier<T>,
    activation: KibanaBindingActivation<T>
  ): void;

  /**
   * Registers a handler that will be called after the setup phase against every bound service.
   * @param serviceIdentifier The service identifier to bind the handler to.
   * @param dependencies Dependencies to resolve before calling the handler.
   * @param handler The handler to perform an action with the service instance.
   */
  onSetup<T, A extends unknown[] = any[]>(
    serviceIdentifier: ServiceIdentifier<T>,
    ...args: [...dependencies: MapToResolvedValueInjectOptions<A>, handler: KibanaHandler<T, A>]
  ): void;

  /**
   * Registers a handler that will be called after the start phase against every bound service.
   * @param serviceIdentifier The service identifier to bind the handler to.
   * @param dependencies Dependencies to resolve before calling the handler.
   * @param handler The handler to perform an action with the service instance.
   */
  onStart<T, A extends unknown[] = any[]>(
    serviceIdentifier: ServiceIdentifier<T>,
    ...args: [...dependencies: MapToResolvedValueInjectOptions<A>, handler: KibanaHandler<T, A>]
  ): void;

  /**
   * Wraps a handler that will be called after the start phase injecting the listed dependencies.
   * The returned function can be used in dynamic bindings like `toDynamicValue` or `toFactory` or as an `onActivation` handler.
   * @example
   * ```ts
   * import { KibanaContainerModule } from '@kbn/core-di';
   *
   * export const module = new KibanaContainerModule(({ bind, inject }) => {
   *   bind(Token).toDynamicValue(inject(User, Key, (user, key) => getToken(user, key)));
   * });
   * ```
   * @param dependencies Dependencies to resolve before calling the inner function.
   * @param inner A function to wrap inside an asynchronous function.
   */
  inject<R, A extends unknown[], D extends unknown[]>(
    ...definition: [...dependencies: MapToResolvedValueInjectOptions<D>, inner: Injectable<R, A, D>]
  ): (context: Pick<ResolutionContext, 'getAsync' | 'getAllAsync'>, ...args: A) => Promise<R>;
}

/**
 * An extended binding supporting Kibana-specific features.
 * @public
 */
export type KibanaBind = <T>(
  serviceIdentifier: ServiceIdentifier<T>
) => KibanaBindToFluentSyntax<T>;

/**
 * An extended fluent binding syntax supporting Kibana-specific features.
 * @public
 */
export interface KibanaBindToFluentSyntax<T> extends BindToFluentSyntax<T> {
  /**
   * A dynamic value binding supporting Kibana resolution context.
   * @param builder A function that will be called to resolve the value of the binding.
   */
  toDynamicValue(builder: KibanaDynamicValueBuilder<T>): BindInWhenOnFluentSyntax<T>;

  /**
   * A factory binding supporting Kibana resolution context.
   * @param factory A function that will be called to resolve the value of the binding.
   */
  toFactory(
    factory: T extends Factory<unknown, any> ? KibanaFactory<T> : never
  ): BindWhenOnFluentSyntax<T>;
}

/**
 * A dynamic value builder supporting Kibana resolution context.
 * @public
 */
export type KibanaDynamicValueBuilder<T> = (
  context: KibanaResolutionContext
) => ReturnType<DynamicValueBuilder<T>>;

/**
 * A factory supporting Kibana resolution context.
 * @public
 */
export type KibanaFactory<T> = (context: KibanaResolutionContext) => T | Promise<T>;

/**
 * A handler that will be called after the setup or start phase injecting the listed dependencies.
 * @public
 */
export type KibanaHandler<T, A extends unknown[] = [], R = void> = (
  context: KibanaResolutionContext,
  injectable: T,
  ...services: A
) => R;

/**
 * An extended binding activation handler supporting Kibana resolution context.
 * @public
 */
export type KibanaBindingActivation<T = unknown> = (
  context: KibanaResolutionContext,
  injectable: T
) => ReturnType<BindingActivation<T>>;

/**
 * An extended resolution context providing Kibana-specific features.
 * @public
 */
export interface KibanaResolutionContext extends ResolutionContext {
  /**
   * Wraps a handler that will be called after the start phase injecting the listed dependencies.
   * @example
   * ```ts
   * import { KibanaContainerModule } from '@kbn/core-di';
   *
   * export const module = new KibanaContainerModule(({ bind, inject }) => {
   *   bind(Route).onSetup(({ inject }, router, route) => {
   *     router.register(route, inject(CoreStart('elasticsearch'), (client, request, response) => {
   *       return client.search(request.body);
   *     });
   *   }, Router);
   * });
   * ```
   * @param dependencies Dependencies to resolve before calling the inner function.
   * @param handler A function to wrap inside an asynchronous function.
   */
  inject<R, A extends unknown[], D extends unknown[]>(
    ...args: [...dependencies: MapToResolvedValueInjectOptions<D>, inner: Injectable<R, A, D>]
  ): (...args: A) => Promise<R>;
}

/**
 * A function that can be injected with dependencies and arguments.
 * @public
 */
export type Injectable<R, A extends unknown[], D extends unknown[]> = (
  ...args: [...dependencies: D, ...arguments: A]
) => Promise<R> | R;

interface NormalizedResolutionOptions<T> extends GetOptions, GetAllOptions {
  serviceIdentifier: ServiceIdentifier<T>;
  isMultiple?: boolean;
}

function normalizeResolutionOptions<T>(
  request: ResolvedValueInjectOptions<T>
): NormalizedResolutionOptions<T> {
  if (typeof request !== 'object') {
    return { serviceIdentifier: request };
  }

  if (LazyServiceIdentifier.is(request)) {
    return { serviceIdentifier: request.unwrap() };
  }

  return {
    ...request,
    serviceIdentifier: LazyServiceIdentifier.is<T>(request.serviceIdentifier)
      ? request.serviceIdentifier.unwrap()
      : (request.serviceIdentifier as ServiceIdentifier<T>),
  };
}

function resolveSync<A extends unknown[]>(
  context: Pick<ResolutionContext, 'get' | 'getAll'>,
  services: MapToResolvedValueInjectOptions<A>
): A {
  return services.map((service) => {
    const { serviceIdentifier, isMultiple, ...options } = normalizeResolutionOptions(service);

    return isMultiple
      ? context.getAll(serviceIdentifier, options)
      : context.get(serviceIdentifier, options);
  }) as A;
}

function resolveAsync<A extends unknown[]>(
  context: Pick<ResolutionContext, 'getAsync' | 'getAllAsync'>,
  services: MapToResolvedValueInjectOptions<A>
): Promise<A> {
  return Promise.all(
    services.map((service) => {
      const { serviceIdentifier, isMultiple, ...options } = normalizeResolutionOptions(service);

      return isMultiple
        ? context.getAllAsync(serviceIdentifier, options)
        : context.getAsync(serviceIdentifier, options);
    })
  ) as Promise<A>;
}

function pop<H extends unknown[], L>(tuple: [...head: H, last: L]): [H, L] {
  return [tuple.slice(0, -1) as H, tuple[tuple.length - 1] as L];
}

function toKibanaContainerModuleLoadOptions(
  options: ContainerModuleLoadOptions
): KibanaContainerModuleLoadOptions {
  const started = new Promise((resolve) => {
    const id = options
      .bind(OnStart)
      .toConstantValue(
        once((container) => {
          resolve(container);
          options.unbind(id);
        })
      )
      .getIdentifier();
  });

  const inject = ((...definition) =>
    async (context, ...args) => {
      await started;
      const [dependencies, inner] = pop(definition);
      const resolvedDependencies = await resolveAsync(context, dependencies);

      return inner(...resolvedDependencies, ...args);
    }) as KibanaContainerModuleLoadOptions['inject'];

  const bind = ((serviceIdentifier) => {
    const fluentSyntax = options.bind(serviceIdentifier);

    return Object.defineProperties(fluentSyntax, {
      toDynamicValue: {
        value: wrap(
          fluentSyntax.toDynamicValue,
          (toDynamicValue, ...[builder, ...rest]: Parameters<typeof fluentSyntax.toDynamicValue>) =>
            toDynamicValue.call(
              fluentSyntax,
              wrap(builder, (inner, context) => inner(toKibanaResolutionContext(context))),
              ...rest
            )
        ),
      },
      toFactory: {
        value: wrap(
          fluentSyntax.toFactory,
          (toFactory, ...[factory, ...rest]: Parameters<typeof fluentSyntax.toFactory>) =>
            toFactory.call(
              fluentSyntax,
              wrap(factory, (inner, context) =>
                inner(toKibanaResolutionContext(context))
              ) as Parameters<typeof toFactory>[0],
              ...rest
            )
        ),
      },
    });
  }) as KibanaContainerModuleLoadOptions['bind'];

  const onActivation = ((serviceIdentifier, activation) => {
    options.onActivation(serviceIdentifier, (context, injectable) =>
      activation(toKibanaResolutionContext(context), injectable)
    );
  }) as KibanaContainerModuleLoadOptions['onActivation'];

  function toKibanaResolutionContext(context: ResolutionContext): KibanaResolutionContext {
    return {
      ...context,
      inject: (...args) => inject(...args).bind(undefined, context),
    };
  }

  function createHook(
    hook: ServiceIdentifier<(container: Container) => void>
  ): KibanaContainerModuleLoadOptions['onSetup'] | KibanaContainerModuleLoadOptions['onStart'] {
    return (serviceIdentifier, ...definition) => {
      const [dependencies, handler] = pop(definition);

      options
        .bind(hook)
        .toDynamicValue((context) => (container) => {
          if (!container.isCurrentBound(serviceIdentifier)) {
            return;
          }
          const kibanaResolutionContext = toKibanaResolutionContext(context);
          const resolvedDependencies = resolveSync(context, dependencies);

          container.getAll(serviceIdentifier).forEach((injectable) => {
            handler(...([kibanaResolutionContext, injectable, ...resolvedDependencies] as const));
          });
        })
        .inRequestScope();
    };
  }

  return {
    ...options,
    bind,
    inject,
    onActivation,
    onSetup: createHook(OnSetup),
    onStart: createHook(OnStart),
  };
}

/**
 * An extended container module that supports Kibana-specific features.
 * @public
 */
export class KibanaContainerModule extends ContainerModule {
  constructor(load: (options: KibanaContainerModuleLoadOptions) => void | Promise<void>) {
    super((options) => load(toKibanaContainerModuleLoadOptions(options)));
  }
}
