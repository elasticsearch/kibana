/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OpenAPIV3 } from 'openapi-types';
import type { DeepPartial, MaybePromise } from '@kbn/utility-types';
import type { RouteValidator } from './route_validator';

/**
 * The set of valid body.output
 * @public
 */
export const validBodyOutput = ['data', 'stream'] as const;

/**
 * Set of HTTP methods changing the state of the server.
 * @public
 */
export type DestructiveRouteMethod = 'post' | 'put' | 'delete' | 'patch';

/**
 * Set of HTTP methods not changing the state of the server.
 * @public
 */
export type SafeRouteMethod = 'get' | 'options';

/**
 * The set of common HTTP methods supported by Kibana routing.
 * @public
 */
export type RouteMethod = SafeRouteMethod | DestructiveRouteMethod;

/**
 * Code sample metadata rendered by the public API docs.
 * @public
 */
export interface OASCodeSample {
  lang: string;
  label?: string;
  source: string;
}

/**
 * Partial OpenAPI operation object merged into generated route docs.
 * @public
 */
export type OASOperationObject = DeepPartial<
  OpenAPIV3.OperationObject & {
    'x-codeSamples': OASCodeSample[];
  }
>;

/**
 * Lazily provides route-specific OpenAPI operation metadata.
 * @public
 */
export type OASOperationObjectProvider = () => string | MaybePromise<OASOperationObject>;

/**
 * The set of supported parseable Content-Types
 * @public
 */
export type RouteContentType =
  | 'application/json'
  | 'application/*+json'
  | 'application/octet-stream'
  | 'application/x-www-form-urlencoded'
  | 'multipart/form-data'
  | 'text/*';

/**
 * Additional body options for a route
 * @public
 */
export interface RouteConfigOptionsBody {
  /**
   * A string or an array of strings with the allowed mime types for the endpoint. Use this settings to limit the set of allowed mime types. Note that allowing additional mime types not listed
   * above will not enable them to be parsed, and if parse is true, the request will result in an error response.
   *
   * Default value: allows parsing of the following mime types:
   * * application/json
   * * application/*+json
   * * application/octet-stream
   * * application/x-www-form-urlencoded
   * * multipart/form-data
   * * text/*
   */
  accepts?: RouteContentType | RouteContentType[] | string | string[];

  /**
   * A mime type string overriding the 'Content-Type' header value received.
   */
  override?: string;

  /**
   * Limits the size of incoming payloads to the specified byte count. Allowing very large payloads may cause the server to run out of memory.
   *
   * Default value: The one set in the kibana.yml config file under the parameter `server.maxPayload`.
   */
  maxBytes?: number;

  /**
   * The processed payload format. The value must be one of:
   * * 'data' - the incoming payload is read fully into memory. If parse is true, the payload is parsed (JSON, form-decoded, multipart) based on the 'Content-Type' header. If parse is false, a raw
   * Buffer is returned.
   * * 'stream' - the incoming payload is made available via a Stream.Readable interface. If the payload is 'multipart/form-data' and parse is true, field values are presented as text while files
   * are provided as streams. File streams from a 'multipart/form-data' upload will also have a hapi property containing the filename and headers properties. Note that payload streams for multipart
   * payloads are a synthetic interface created on top of the entire multipart content loaded into memory. To avoid loading large multipart payloads into memory, set parse to false and handle the
   * multipart payload in the handler using a streaming parser (e.g. pez).
   *
   * Default value: 'data', unless no validation.body is provided in the route definition. In that case the default is 'stream' to alleviate memory pressure.
   */
  output?: (typeof validBodyOutput)[number];

  /**
   * Determines if the incoming payload is processed or presented raw. Available values:
   * * true - if the request 'Content-Type' matches the allowed mime types set by allow (for the whole payload as well as parts), the payload is converted into an object when possible. If the
   * format is unknown, a Bad Request (400) error response is sent. Any known content encoding is decoded.
   * * false - the raw payload is returned unmodified.
   * * 'gunzip' - the raw payload is returned unmodified after any known content encoding is decoded.
   *
   * Default value: true, unless no validation.body is provided in the route definition. In that case the default is false to alleviate memory pressure.
   */
  parse?: boolean | 'gunzip';
}

/**
 * Route access level.
 *
 * Public routes are stable and intended for external access and are subject to
 * stricter change management and have long term maintenance windows.
 *
 * @remark as of 9.0, access to internal routes is restricted by default. See https://github.com/elastic/kibana/issues/163654.
 */
export type RouteAccess = 'public' | 'internal';

export type Privilege = string;

/**
 * Route Deprecation info
 * This information will assist Kibana HTTP API users when upgrading to new versions
 * of the Elastic stack (via Upgrade Assistant) and will be surfaced in documentation
 * created from HTTP API introspection (like OAS).
 */
export interface RouteDeprecationInfo {
  /**
   * Link to the documentation for more details on the deprecation.
   *
   * @remark See template and instructions in `<REPO_ROOT>/docs/upgrade-notes.asciidoc` for instructions on adding a release note.
   */
  documentationUrl: string;
  /**
   * The description message to be displayed for the deprecation.
   * This will also appear in the '299 Kibana-{version} {message}' header warning when someone calls the route.
   * Keep the message concise to avoid long header values. It is recommended to keep the message under 255 characters.
   * Check the README for writing deprecations in `src/core/server/deprecations/README.mdx`
   */
  message?: string;
  /**
   * levels:
   * - warning: will not break deployment upon upgrade.
   * - critical: needs to be addressed before upgrade.
   */
  severity: 'warning' | 'critical';
  /**
   * API deprecation reason:
   * - bump: New version of the API is available.
   * - remove: API was fully removed with no replacement.
   * - migrate: API has been migrated to a different path.
   * - deprecated: the deprecated API is deprecated, it might be removed or migrated, or got a version bump in the future.
   *   It is a catch-all deprecation for APIs but the API will work in the next upgrades.
   */
  reason:
    | VersionBumpDeprecationType
    | RemovalApiDeprecationType
    | MigrationApiDeprecationType
    | DeprecateApiDeprecationType;
}

interface VersionBumpDeprecationType {
  /**
   * bump deprecation reason denotes a new version of the API is available
   */
  type: 'bump';
  /**
   * new version of the API to be used instead.
   */
  newApiVersion: string;
}

interface RemovalApiDeprecationType {
  /**
   * remove deprecation reason denotes the API was fully removed with no replacement
   */
  type: 'remove';
}

interface MigrationApiDeprecationType {
  /**
   * migrate deprecation reason denotes the API has been migrated to a different API path
   * Please make sure that if you are only incrementing the version of the API to use 'bump' instead
   */
  type: 'migrate';
  /**
   * new API path to be used instead
   */
  newApiPath: string;
  /**
   * new API method (GET POST PUT DELETE) to be used with the new API.
   */
  newApiMethod: string;
}

interface DeprecateApiDeprecationType {
  /**
   * deprecate deprecation reason denotes the API is deprecated but it doesnt have a replacement
   * or a clear version that it will be removed in. This is useful to alert users that the API is deprecated
   * to allow them as much time as possible to work around this fact before the deprecation
   * turns into a `remove` or `migrate` or `bump` type.
   *
   * Recommended to pair this with `severity: 'warning'` to avoid blocking the upgrades for this type.
   */
  type: 'deprecate';
}

export type AllRequiredCondition = Array<Privilege | { anyOf: Privilege[] }>;
export type AnyRequiredCondition = Array<Privilege | { allOf: Privilege[] }>;

/**
 * A set of privileges that can be used to define complex authorization requirements.
 *
 * - `anyRequired`: An array of privileges where at least one must be satisfied to meet the authorization requirement.
 * - `allRequired`: An array of privileges where all listed privileges must be satisfied to meet the authorization requirement.
 */
export interface PrivilegeSet {
  anyRequired?: AnyRequiredCondition;
  allRequired?: AllRequiredCondition;
}

/**
 * An array representing a combination of simple privileges or complex privilege sets.
 */
export type Privileges = Array<Privilege | PrivilegeSet>;

/**
 * Describes the authorization requirements when authorization is enabled.
 *
 * - `requiredPrivileges`: An array of privileges or privilege sets that are required for the route.
 */
export interface AuthzEnabled {
  requiredPrivileges: Privileges;
}

/**
 * Describes the state when authorization is disabled.
 *
 * - `enabled`: A boolean indicating that authorization is not enabled (`false`).
 * - `reason`: A string explaining why authorization is disabled.
 */
export interface AuthzDisabled {
  enabled: false;
  reason: string;
}

/**
 * Describes the authentication status when authentication is enabled (default).
 */
export interface AuthcEnabled {
  enabled: true;
}

/**
 * Describes the authentication status when authentication is switched to a minimal mode (only existence of credentials
 * is checked). Requires an explicit reason explaining why full authentication can be deferred to Elasticsearch.
 */
export interface AuthcMinimal {
  enabled: 'minimal';
  reason: string;
}

/**
 * Describes the authentication status when authentication is optional. Requires an explicit reason explaining why
 * authentication is optional.
 */
export interface AuthcOptional {
  enabled: 'optional';
  reason: string;
}

/**
 * Describes the state when authentication is disabled.
 *
 * - `enabled`: A boolean indicating that authentication is not enabled (`false`).
 * - `reason`: A string explaining why authentication is disabled.
 */
export interface AuthcDisabled {
  enabled: false;
  reason: string;
}

/**
 * Represents the authentication status for a route. It can either be enabled (`AuthcEnabled`), minimal (`AuthcMinimal`),
 * optional (`AuthcOptional`), or disabled (`AuthcDisabled`).
 */
export type RouteAuthc = AuthcEnabled | AuthcMinimal | AuthcOptional | AuthcDisabled;

/**
 * Represents the authorization status for a route. It can either be enabled (`AuthzEnabled`) or disabled (`AuthzDisabled`).
 */
export type RouteAuthz = AuthzEnabled | AuthzDisabled;

/**
 * Describes the security requirements for a route, including authorization and authentication.
 */
export interface RouteSecurity {
  authz: RouteAuthz;
  authc?: RouteAuthc;
}

/**
 * A set of reserved privileges that can be used to check access to the route.
 */
export enum ReservedPrivilegesSet {
  operator = 'operator',
  superuser = 'superuser',
}

/**
 * Additional route options.
 * @public
 */
export interface RouteConfigOptions<Method extends RouteMethod> {
  /**
   * Defines xsrf protection requirements for a route:
   * - true. Requires an incoming POST/PUT/DELETE request to contain `kbn-xsrf` header.
   * - false. Disables xsrf protection.
   *
   * Set to true by default
   */
  xsrfRequired?: Method extends 'get' ? never : boolean;

  /**
   * Defines intended request origin of the route:
   * - public. The route is public, declared stable and intended for external access.
   *           In the future, may require an incoming request to contain a specified header.
   * - internal. The route is internal and intended for internal access only.
   *
   * Defaults to 'internal' If not declared,
   */
  access?: RouteAccess;

  /**
   * Additional metadata tag strings to attach to the route.
   */
  tags?: readonly string[];

  /**
   * Additional body options {@link RouteConfigOptionsBody}.
   */
  body?: Method extends 'get' | 'options' ? undefined : RouteConfigOptionsBody;

  /**
   * Defines per-route timeouts.
   */
  timeout?: {
    /**
     * Milliseconds to receive the payload
     */
    payload?: Method extends 'get' | 'options' ? undefined : number;

    /**
     * Milliseconds the socket can be idle before it's closed
     */
    idleSocket?: number;
  };

  /**
   * Short summary of this route. Required for all routes used in OAS documentation.
   *
   * @example
   * ```ts
   * router.get({
   *  path: '/api/foo/{id}',
   *  access: 'public',
   *  summary: `Get foo resources for an ID`,
   * })
   * ```
   */
  summary?: string;

  /**
   * Optional API description, which supports [CommonMark](https://spec.commonmark.org) markdown formatting
   *
   * @example
   * ```ts
   * router.get({
   *  path: '/api/foo/{id}',
   *  access: 'public',
   *  summary: `Get foo resources for an ID`,
   *  description: `Foo resources require **X** and **Y** `read` permissions to access.`,
   * })
   * ```
   */
  description?: string;

  /**
   * Description of deprecations for this HTTP API.
   *
   * @remark This will assist Kibana HTTP API users when upgrading to new versions
   * of the Elastic stack (via Upgrade Assistant) and will be surfaced in documentation
   * created from HTTP API introspection (like OAS).
   *
   * Setting this object marks the route as deprecated.
   *
   * @remarks This may be surfaced in OAS documentation.
   * @public
   */
  deprecated?: RouteDeprecationInfo;

  /**
   * Filepath to a YAML file or a partial {@link OpenAPIV3.OperationObject} to
   * be merged with the code generated for this endpoint.
   *
   * @note Always instantiate the objects lazily to avoid unnecessarily loading
   *       objects into memory.
   *
   * @example
   * As a path to a OAS file
   * () => path.join(__dirname, 'my_examples.yaml')
   *
   * @example
   * As an object
   * () => ({
   *      requestBody: {
   *        content: {
   *          200: {
   *            examples: {
   *              fooExample: {
   *                value: { coolType: true } as { coolType: true },
   *              },
   *            },
   *          },
   *        },
   *      },
   *  })
   */
  oasOperationObject?: OASOperationObjectProvider;

  /**
   * Whether this route should be treated as "invisible" and excluded from router
   * OAS introspection.
   *
   * @default false
   */
  excludeFromOAS?: boolean;

  /**
   * Whether the rate limiter should never throttle this route.
   *
   * @default false
   */
  excludeFromRateLimiter?: boolean;

  /**
   * Release version or date that this route will be removed
   * Use with `deprecated: true`
   *
   * @remarks This will be surfaced in OAS documentation.
   * @example 9.0.0
   */
  discontinued?: string;

  /**
   * Whether this endpoint is being used to serve generated or static HTTP resources
   * like JS, CSS or HTML. _Do not set to `true` for HTTP APIs._
   *
   * @note Unless you need this setting for a special case, rather use the
   *       {@link HttpResources} service exposed to plugins directly.
   *
   * @note This is not a security feature. It may affect aspects of the HTTP
   *       response like headers.
   *
   * @default false
   */
  httpResource?: boolean;

  /**
   * Based on the the ES API specification (see https://github.com/elastic/elasticsearch-specification)
   * Kibana APIs can also specify some metadata about API availability.
   *
   * This setting is only applicable if your route `access` is `public`.
   *
   * @remark intended to be used for informational purposes only.
   */
  availability?: {
    /** @default stable */
    stability?: 'experimental' | 'stable' | 'tech_preview';
    /**
     * The stack version in which the route was introduced (eg: 8.15.0).
     */
    since?: string;
  };
}

/**
 * Route specific configuration.
 * @public
 */
export interface RouteConfig<P, Q, B, Method extends RouteMethod> {
  /**
   * The endpoint _within_ the router path to register the route.
   *
   * @remarks
   * E.g. if the router is registered at `/elasticsearch` and the route path is
   * `/search`, the full path for the route is `/elasticsearch/search`.
   * Supports:
   *   - named path segments `path/{name}`.
   *   - optional path segments `path/{position?}`.
   *   - multi-segments `path/{coordinates*2}`.
   * Segments are accessible within a handler function as `params` property of {@link KibanaRequest} object.
   * To have read access to `params` you *must* specify validation schema with {@link RouteConfig.validate}.
   */
  path: string;

  /**
   * A schema created with `@kbn/config-schema` that every request will be validated against.
   *
   * @remarks
   * You *must* specify a validation schema to be able to read:
   *   - url path segments
   *   - request query
   *   - request body
   * To opt out of validating the request, specify `validate: false`. In this case
   * request params, query, and body will be **empty** objects and have no
   * access to raw values.
   * In some cases you may want to use another validation library. To do this, you need to
   * instruct the `@kbn/config-schema` library to output **non-validated values** with
   * setting schema as `schema.object({}, { unknowns: 'allow' })`;
   *
   * @example
   * ```ts
   *  import { schema } from '@kbn/config-schema';
   *  router.get({
   *   path: 'path/{id}',
   *   validate: {
   *     params: schema.object({
   *       id: schema.string(),
   *     }),
   *     query: schema.object({...}),
   *     body: schema.object({...}),
   *   },
   * },
   * (context, req, res,) {
   *   req.params; // type Readonly<{id: string}>
   *   console.log(req.params.id); // value
   * });
   *
   * router.get({
   *   path: 'path/{id}',
   *   validate: false, // handler has no access to params, query, body values.
   * },
   * (context, req, res,) {
   *   req.params; // type Readonly<{}>;
   *   console.log(req.params.id); // undefined
   * });
   *
   * router.get({
   *   path: 'path/{id}',
   *   validate: {
   *     // handler has access to raw non-validated params in runtime
   *     params: schema.object({}, { unknowns: 'allow' })
   *   },
   * },
   * (context, req, res,) {
   *   req.params; // type Readonly<{}>;
   *   console.log(req.params.id); // value
   *   myValidationLibrary.validate({ params: req.params });
   * });
   * ```
   */
  validate: RouteValidator<P, Q, B> | (() => RouteValidator<P, Q, B>) | false;

  /**
   * Defines the security requirements for a route, including authorization and authentication.
   */
  security: RouteSecurity;

  /**
   * Additional route options {@link RouteConfigOptions}.
   */
  options?: RouteConfigOptions<Method>;
}

/**
 * Post Validation Route emitter metadata.
 */
export interface PostValidationMetadata {
  deprecated?: RouteDeprecationInfo;
  isInternalApiRequest: boolean;
  isPublicAccess: boolean;
}
