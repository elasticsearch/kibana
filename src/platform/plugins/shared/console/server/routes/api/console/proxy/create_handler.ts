/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { STATUS_CODES } from 'http';
import type { IncomingHttpHeaders } from 'http';
import type { Readable } from 'stream';
import { errors } from '@elastic/elasticsearch';

import type {
  ICustomClusterClient,
  KibanaRequest,
  RequestHandler,
  RequestHandlerContext,
} from '@kbn/core/server';

// TODO: find a better way to get information from the request like remoteAddress and remotePort
// for forwarding.
import { ensureRawRequest } from '@kbn/core-http-router-server-internal';

import type { RouteDependencies } from '../../..';

import type { Body, Query } from './validation_config';
import { toURL, stripCredentialsFromUrl } from '../../../../lib/utils';

function getProxyHeaders(req: KibanaRequest) {
  const headers = Object.create(null);

  // Scope this proto-unsafe functionality to where it is being used.
  function extendCommaList(obj: Record<string, any>, property: string, value: string) {
    obj[property] = (obj[property] ? obj[property] + ',' : '') + value;
  }

  const _req = ensureRawRequest(req);

  if (_req?.info?.remotePort && _req?.info?.remoteAddress) {
    // see https://git.io/vytQ7
    extendCommaList(headers, 'x-forwarded-for', _req.info.remoteAddress);
    extendCommaList(headers, 'x-forwarded-port', _req.info.remotePort);
    extendCommaList(headers, 'x-forwarded-proto', _req.server.info.protocol);
    extendCommaList(headers, 'x-forwarded-host', _req.info.host);
  }

  return headers;
}

function closeCustomClientOnStreamEnd(customClient: ICustomClusterClient, stream: Readable) {
  let isClosed = false;
  const closeCustomClient = () => {
    if (isClosed) {
      return;
    }
    isClosed = true;
    stream.off('end', closeCustomClient);
    stream.off('close', closeCustomClient);
    stream.off('error', closeCustomClient);
    void customClient.close();
  };

  stream.once('end', closeCustomClient);
  stream.once('close', closeCustomClient);
  stream.once('error', closeCustomClient);
}

export const createHandler =
  ({
    log,
    getStartServices,
    proxy: { readLegacyESConfig },
  }: RouteDependencies): RequestHandler<unknown, Query, Body, RequestHandlerContext> =>
  async (ctx, request, response) => {
    const { body, query } = request;
    const { method, path, withProductOrigin, host: requestHost } = query;

    const legacyConfig = await readLegacyESConfig();
    const { hosts } = legacyConfig;
    let customClient: ICustomClusterClient | undefined;

    // Validate that the requested host is one of the configured Elasticsearch hosts.
    // The client receives URLs with credentials stripped, so we match by comparing
    // stripped versions to find the original configured host (which may contain
    // credentials needed for auth). Reject any host not in the allowlist to prevent SSRF.
    let host = hosts[0];
    if (requestHost) {
      // Normalize the incoming host the same way we normalize configured hosts
      // (e.g. adding trailing slash, dropping default ports) so that old values
      // stored in the client's localStorage still match after URL normalisation.
      const normalizedRequestHost = stripCredentialsFromUrl(requestHost);
      const match = hosts.find((h) => stripCredentialsFromUrl(h) === normalizedRequestHost);
      if (!match) {
        return response.badRequest({
          body: 'Host is not configured in elasticsearch.hosts',
        });
      }
      host = match;
    }
    try {
      const uri = toURL(host, path);

      const requestHeaders: IncomingHttpHeaders = {
        ...getProxyHeaders(request),
        'content-type': request.headers['content-type'] ?? 'application/json',
        // Node's http client omits chunked framing for GET/DELETE bodies (it sets
        // useChunkedEncodingByDefault=false for those methods), which would send the body
        // unframed and drop it. ES allows bodies on GET/DELETE (e.g. `GET /_search`), so force
        // chunked encoding to keep proxied Console request bodies intact.
        'transfer-encoding': 'chunked',
        // Console uses this proxy for both user-entered requests and internal autocomplete
        // requests. Mark internal requests as Kibana-origin so system-index lookups do not
        // produce user-actionable deprecation warnings. For user-entered requests, send an
        // empty value to clear the Core ES client's default Kibana-origin header.
        'x-elastic-product-origin': withProductOrigin ? 'kibana' : '',
      };

      if (requestHost) {
        const [coreStart] = await getStartServices();
        customClient = coreStart.elasticsearch.createClient('console', {
          hosts: [host],
          sniffOnStart: false,
          sniffOnConnectionFault: false,
          sniffInterval: false,
          customHeaders: legacyConfig.customHeaders,
          requestHeadersWhitelist: legacyConfig.requestHeadersWhitelist,
          requestTimeout: legacyConfig.requestTimeout,
          ssl: legacyConfig.ssl,
        });
      }

      const esClient = requestHost
        ? customClient!.asScoped(request).asCurrentUser
        : (await ctx.core).elasticsearch.client.asCurrentUser;

      const esResponse = await esClient.transport.request<Readable>(
        {
          method: method.toUpperCase(),
          path: `${uri.pathname}${uri.search || ''}`,
          body,
        },
        {
          asStream: true,
          meta: true,
          requestTimeout: legacyConfig.requestTimeout.asMilliseconds(),
          headers: requestHeaders,
          context: {
            loggingOptions: {
              loggerName: 'console',
            },
          },
        }
      );

      const { statusCode, headers } = esResponse;
      const statusMessage = STATUS_CODES[statusCode] ?? '';
      const isHeadRequest = method.toUpperCase() === 'HEAD';

      if (customClient) {
        closeCustomClientOnStreamEnd(customClient, esResponse.body);
      }

      if (isHeadRequest) {
        esResponse.body.resume();
      }

      return response.ok({
        body: isHeadRequest ? `${statusCode} - ${statusMessage}` : esResponse.body,
        headers: {
          warning: headers.warning || '',
          // We need to set the status code and status text as headers so that the client can access them
          // in the response. This is needed because the client is using them to show the status of the request
          // in the UI. By sending them as headers we avoid logging out users if the status code is 403. E.g.
          // if the user is not authorized to access the cluster, we don't want to log them out. (See https://github.com/elastic/kibana/issues/140536)
          'x-console-proxy-status-code': String(statusCode) || '',
          'x-console-proxy-status-text': statusMessage,
          ...(isHeadRequest && { 'Content-Type': 'text/plain' }),
        },
      });
    } catch (e) {
      if (e instanceof errors.TimeoutError) {
        // The client gave up waiting, but Elasticsearch may still be executing the request
        // (e.g. a snapshot restore), so tell the user instead of reporting a connection failure.
        const timeoutSeconds = legacyConfig.requestTimeout.asSeconds();
        // The default client round-robins across all configured hosts, so name the node the
        // request actually went to; fall back to the configured host if the error carries none.
        const timedOutNode = e.meta?.meta.connection?.url.toString() ?? host;
        log.warn(
          `Request to Elasticsearch node [${stripCredentialsFromUrl(
            timedOutNode
          )}] timed out after ${timeoutSeconds} seconds: ${method.toUpperCase()} ${
            path.split('?')[0]
          }`
        );

        await customClient?.close();

        return response.custom({
          statusCode: 504,
          body: {
            message: `Elasticsearch did not respond within ${timeoutSeconds} seconds. Kibana stopped waiting, but Elasticsearch may still be processing the request, so check its status before retrying. On self-managed Kibana, increase elasticsearch.requestTimeout to wait longer.`,
          },
          headers: {
            'x-console-proxy-status-code': '504',
            'x-console-proxy-status-text': 'Gateway Timeout',
            'content-type': 'application/json',
          },
        });
      }

      log.error(e);
      log.warn(`Could not connect to ES node [${host}]`);

      const hasMultipleHosts = hosts.length > 1;
      const errorMessage =
        'Could not connect to Elasticsearch node. Try selecting a different host from Console > Config > General settings > Elasticsearch host.';

      await customClient?.close();

      return response.custom({
        statusCode: 502,
        body: {
          message: 'An internal server error occurred. Check Kibana server logs for details.',
        },
        headers: {
          'x-console-proxy-status-code': '502',
          'x-console-proxy-status-text': 'Bad Gateway',
          'content-type': 'application/json',
          ...(hasMultipleHosts && { warning: errorMessage }),
        },
      });
    }
  };
