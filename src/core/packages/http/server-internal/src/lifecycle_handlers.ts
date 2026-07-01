/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  OnPostAuthHandler,
  OnPreAuthHandler,
  OnPreResponseHandler,
  OnPreResponseInfo,
  KibanaRequest,
} from '@kbn/core-http-server';
import type { GetAuthState } from '@kbn/core-http-server';
import {
  getWarningHeaderMessageFromRouteDeprecation,
  isSafeMethod,
} from '@kbn/core-http-router-server-internal';
import type { Logger } from '@kbn/logging';
import { KIBANA_BUILD_NR_HEADER } from '@kbn/core-http-common';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import type { HttpConfig } from './http_config';

const VERSION_HEADER = 'kbn-version';
const XSRF_HEADER = 'kbn-xsrf';
const KIBANA_NAME_HEADER = 'kbn-name';

export const createXsrfPostAuthHandler = (
  config: HttpConfig,
  getAuthState: GetAuthState
): OnPostAuthHandler => {
  const { allowlist, disableProtection, allowedSchemes } = config.xsrf;
  // `allowedSchemes` is validated against a stateless-credential safe set and normalized to
  // lower-case in HttpConfig, so the values are canonical here. Core reads
  // http_authentication_scheme from AuthenticatedUser (set by the security plugin's HTTP auth
  // provider), which only sets it for requests authenticated via an Authorization header.
  const exemptSchemes = new Set(allowedSchemes);

  return (request, response, toolkit) => {
    if (
      disableProtection ||
      allowlist.includes(request.route.path) ||
      request.route.options.xsrfRequired === false
    ) {
      return toolkit.next();
    }

    if (exemptSchemes.size > 0 && !isSafeMethod(request.route.method)) {
      const authState = getAuthState<AuthenticatedUser>(request);
      const scheme = authState.state?.http_authentication_scheme;
      if (scheme != null && exemptSchemes.has(scheme.toLowerCase())) {
        return toolkit.next();
      }
    }

    const hasVersionHeader = VERSION_HEADER in request.headers;
    const hasXsrfHeader = XSRF_HEADER in request.headers;

    if (!isSafeMethod(request.route.method) && !hasVersionHeader && !hasXsrfHeader) {
      return response.badRequest({ body: `Request must contain a ${XSRF_HEADER} header.` });
    }

    return toolkit.next();
  };
};

export const createExcludeRoutesPreAuthHandler = (
  config: HttpConfig,
  log: Logger
): OnPreAuthHandler => {
  const excludedRoutes = new Set(config.excludeRoutes);
  log = log.get('server', 'exclude_routes');

  return (request, response, toolkit) => {
    if (excludedRoutes.size === 0) {
      return toolkit.next();
    }

    const routePath = request.route.routePath ?? request.route.path;
    if (excludedRoutes.has(routePath)) {
      log.warn(`Access to route [${routePath}] is blocked by server.excludeRoutes`);
      return response.notFound();
    }

    return toolkit.next();
  };
};

/**
 * This should remain part of the logger prefix so that we can notify/track
 * when we see this logged for observability purposes.
 */
export const INTERNAL_API_RESTRICTED_LOGGER_NAME = 'kbn-internal-api-restricted';
export const createRestrictInternalRoutesPostAuthHandler = (
  config: HttpConfig,
  log: Logger
): OnPostAuthHandler => {
  const isRestrictionEnabled = config.restrictInternalApis;
  log = log.get('server', `${INTERNAL_API_RESTRICTED_LOGGER_NAME}`);

  return (request, response, toolkit) => {
    const isInternalRoute = request.route.options.access === 'internal';
    if (isInternalRoute && !request.isInternalApiRequest) {
      if (!isRestrictionEnabled) {
        // warn if the restriction is not enforced
        log.warn(
          `Access to uri [${request.url.pathname}] with method [${request.route.method}] is deprecated`
        );
      } else {
        log.error(
          `Access to uri [${request.url.pathname}] with method [${request.route.method}] is not available with the current configuration`
        );
        // throw 400
        return response.badRequest({
          body: `uri [${request.url.pathname}] with method [${request.route.method}] exists but is not available with the current configuration`,
        });
      }
    }
    return toolkit.next();
  };
};

export const createVersionCheckPostAuthHandler = (kibanaVersion: string): OnPostAuthHandler => {
  return (request, response, toolkit) => {
    const requestVersion = request.headers[VERSION_HEADER];
    if (requestVersion && requestVersion !== kibanaVersion) {
      return response.badRequest({
        body: {
          message:
            `Browser client is out of date, please refresh the page ` +
            `("${VERSION_HEADER}" header was "${requestVersion}" but should be "${kibanaVersion}")`,
          attributes: {
            expected: kibanaVersion,
            got: requestVersion,
          },
        },
      });
    }
    return toolkit.next();
  };
};

export const createCustomHeadersPreResponseHandler = (config: HttpConfig): OnPreResponseHandler => {
  const {
    name: serverName,
    securityResponseHeaders,
    customResponseHeaders,
    csp: { header: cspHeader, reportOnlyHeader: cspReportOnlyHeader },
  } = config;

  const additionalHeaders = {
    ...securityResponseHeaders,
    ...customResponseHeaders,
    'Content-Security-Policy': cspHeader,
    'Content-Security-Policy-Report-Only': cspReportOnlyHeader,
    [KIBANA_NAME_HEADER]: serverName,
  };

  return (request, response, toolkit) => {
    return toolkit.next({ headers: additionalHeaders });
  };
};

export const createDeprecationWarningHeaderPreResponseHandler = (
  kibanaVersion: string
): OnPreResponseHandler => {
  return (request, response, toolkit) => {
    // we don't want to overwrite the header value
    if (!request.route.options.deprecated || response.headers?.warning) {
      return toolkit.next();
    }
    const additionalHeaders = {
      warning: getWarningHeaderMessageFromRouteDeprecation(
        request.route.options.deprecated,
        kibanaVersion
      ),
    };
    return toolkit.next({ headers: additionalHeaders });
  };
};

const shouldLogBuildNumberMismatch = (
  serverBuild: { number: number; string: string },
  request: KibanaRequest,
  response: OnPreResponseInfo
): { log: true; clientBuild: number } | { log: false } => {
  if (
    response.statusCode >= 400 &&
    request.headers[KIBANA_BUILD_NR_HEADER] !== serverBuild.string
  ) {
    const clientBuildNumber = parseInt(String(request.headers[KIBANA_BUILD_NR_HEADER]), 10);
    if (!isNaN(clientBuildNumber)) {
      return { log: true, clientBuild: clientBuildNumber };
    }
  }
  return { log: false };
};

/**
 * This should remain part of the logger prefix so that we can notify/track
 * when we see this logged for observability purposes.
 */
const BUILD_NUMBER_MISMATCH_LOGGER_NAME = 'kbn-build-number-mismatch';
export const createBuildNrMismatchLoggerPreResponseHandler = (
  serverBuildNumber: number,
  log: Logger
): OnPreResponseHandler => {
  const serverBuild = { number: serverBuildNumber, string: String(serverBuildNumber) };
  log = log.get(BUILD_NUMBER_MISMATCH_LOGGER_NAME);

  return (request, response, toolkit) => {
    const result = shouldLogBuildNumberMismatch(serverBuild, request, response);
    if (result.log === true) {
      const clientCompAdjective = result.clientBuild > serverBuildNumber ? 'newer' : 'older';
      log.warn(
        `Client build (${result.clientBuild}) is ${clientCompAdjective} than this Kibana server build (${serverBuildNumber}). The [${response.statusCode}] error status in req id [${request.id}] may be due to client-server incompatibility!`
      );
    }
    return toolkit.next();
  };
};
