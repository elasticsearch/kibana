/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ApmBase, AgentConfigOptions, Transaction } from '@elastic/apm-rum';
import { modifyUrl } from '@kbn/std';
import type { ExecutionContextStart } from '@kbn/core-execution-context-browser';
import type { InternalApplicationStart } from '@kbn/core-application-browser-internal';
import { ebtSpanFilter } from './filters/ebt_span_filter';
import { CachedResourceObserver } from './apm_resource_counter';

/** "GET protocol://hostname:port/pathname" */
const HTTP_REQUEST_TRANSACTION_NAME_REGEX =
  /^(GET|POST|PUT|HEAD|PATCH|DELETE|OPTIONS|CONNECT|TRACE)\s(.*)$/;
const USER_INTERACTION_ATTR_NAME = 'data-test-subj';

/**
 * This is the entry point used to boot the frontend when serving a application
 * that lives in the Kibana Platform.
 */

interface ApmConfig extends AgentConfigOptions {
  // Kibana-specific config settings:
  globalLabels?: Record<string, string>;
}

interface StartDeps {
  application: InternalApplicationStart;
  executionContext: ExecutionContextStart;
}

export class ApmSystem {
  private readonly enabled: boolean;
  private pageLoadTransaction?: Transaction;
  private resourceObserver: CachedResourceObserver;
  private apm?: ApmBase;
  private executionContext?: ExecutionContextStart;

  /**
   * `apmConfig` would be populated with relevant APM RUM agent
   * configuration if server is started with elastic.apm.* config.
   */
  constructor(private readonly apmConfig?: ApmConfig, private readonly basePath = '') {
    this.enabled = apmConfig != null && !!apmConfig.active;
    this.resourceObserver = new CachedResourceObserver();
  }

  async setup() {
    if (!this.enabled) return;
    const { init, apm } = await import('@elastic/apm-rum');
    this.apm = apm;
    const { globalLabels, ...apmConfig } = this.apmConfig!;
    if (globalLabels) {
      apm.addLabels(globalLabels);
    }
    apm.addLabels({
      user_agent: navigator.userAgent,
    });

    apm.addFilter(ebtSpanFilter);

    // Remove the query params from the URLs (page's URL and refererer)
    apm.addFilter((payload) => {
      payload.transactions.forEach((transaction) => {
        if (transaction.context && transaction.context.page) {
          const { url, referer } = transaction.context.page;
          if (url) {
            transaction.context.page.url = url.split('?')[0];
          }
          if (referer) {
            transaction.context.page.referer = referer.split('?')[0];
          }
        }
      });
      return payload;
    });

    this.addHttpRequestNormalization(apm);
    this.addRouteChangeNormalization(apm);

    init(apmConfig);
    // hold page load transaction blocks a transaction implicitly created by init.
    this.holdPageLoadTransaction(apm);

    // Registering an event handler to improve user-interaction transaction names based on data-test-subj attribute
    // Context: https://github.com/elastic/observability-dev/issues/4528
    window.addEventListener(
      'click',
      function (event) {
        const tr = apm.getCurrentTransaction();
        if (!tr) {
          // In some cases agent decides not to create a transaction
          return;
        }
        const { target } = event;
        if (target instanceof Element) {
          const element = target?.closest(
            `a[${USER_INTERACTION_ATTR_NAME}], button[${USER_INTERACTION_ATTR_NAME}]`
          );
          if (element) {
            tr.name = `Click - ${element.getAttribute(USER_INTERACTION_ATTR_NAME)}`;
          } else if (target.getAttribute(USER_INTERACTION_ATTR_NAME)) {
            tr.name = `Click - ${target.getAttribute(USER_INTERACTION_ATTR_NAME)}`;
          }
        }
      },
      true
    );
  }

  async start(start?: StartDeps) {
    if (!this.enabled || !start) return;

    this.executionContext = start.executionContext;
    this.markPageLoadStart();

    start.executionContext.context$.subscribe((c) => {
      // We're using labels because we want the context to be indexed
      // https://www.elastic.co/guide/en/apm/get-started/current/metadata.html
      const apmContext = start.executionContext.getAsLabels();
      this.apm?.addLabels(apmContext);
    });

    // TODO: Start a new transaction every page change instead of every app change.

    /**
     * Register listeners for navigation changes and capture them as
     * route-change transactions after Kibana app is bootstrapped
     */
    start.application.currentAppId$.subscribe((appId) => {
      if (appId && this.apm) {
        this.closePageLoadTransaction(appId);
        this.apm.startTransaction(appId, 'app-change', {
          managed: true,
          canReuse: true,
        });
      }
    });
  }

  /* Hold the page load transaction open, until all resources actually finish loading */
  private holdPageLoadTransaction(apm: ApmBase) {
    const transaction = apm.getCurrentTransaction();

    // Keep the page load transaction open until all resources finished loading
    if (transaction && transaction.type === 'page-load') {
      this.pageLoadTransaction = transaction;
      // @ts-expect-error 2339  block is a private property of Transaction interface
      this.pageLoadTransaction.block(true);
      this.pageLoadTransaction.mark('apm-setup');
    }
  }

  /* Close and clear the page load transaction */
  private closePageLoadTransaction(appId: string) {
    if (this.pageLoadTransaction) {
      const loadCounts = this.resourceObserver.getCounts();
      this.pageLoadTransaction.addLabels({
        'loaded-resources': loadCounts.networkOrDisk,
        'cached-resources': loadCounts.memory,
      });
      this.resourceObserver.destroy();
      this.pageLoadTransaction.name = `/app/${appId}`;
      this.pageLoadTransaction.end();
      this.pageLoadTransaction = undefined;
    }
  }

  private markPageLoadStart() {
    if (this.pageLoadTransaction) {
      this.pageLoadTransaction.mark('apm-start');
    }
  }

  /**
   * Adds an observer to the APM configuration for normalizing transactions of the 'http-request' type to remove the
   * hostname, protocol, port, and base path. Allows for correlating data cross different deployments.
   */
  private addHttpRequestNormalization(apm: ApmBase) {
    apm.observe('transaction:end', (t) => {
      if (t.type !== 'http-request') {
        return;
      }

      /** Split URLs of the from "GET protocol://hostname:port/pathname" into method & hostname */
      const matches = t.name.match(HTTP_REQUEST_TRANSACTION_NAME_REGEX);
      if (!matches) {
        return;
      }

      const [, method, originalUrl] = matches;
      // Normalize the URL
      const normalizedUrl = modifyUrl(originalUrl, (parts) => {
        const isAbsolute = parts.hostname && parts.protocol && parts.port;
        // If the request was to a different host, port, or protocol then don't change anything
        if (
          isAbsolute &&
          (parts.hostname !== window.location.hostname ||
            parts.protocol !== window.location.protocol ||
            parts.port !== window.location.port)
        ) {
          return;
        }

        // Strip the protocol, hostname, port, and protocol slashes to normalize
        parts.protocol = null;
        parts.hostname = null;
        parts.port = null;
        parts.slashes = false;

        // Replace the basePath if present in the pathname
        if (parts.pathname === this.basePath) {
          parts.pathname = '/';
        } else if (parts.pathname?.startsWith(`${this.basePath}/`)) {
          parts.pathname = parts.pathname?.slice(this.basePath.length);
        }
      });

      t.name = `${method} ${normalizedUrl}`;
    });
  }

  /**
   * Set route-change and page-load transaction names to the destination page name
   * taken from the execution context. Otherwise, these transactions would have
   * default names, like 'Click - span' or a raw URL path, instead of more
   * descriptive '/security/rules/:id/edit'.
   */
  private addRouteChangeNormalization(apm: ApmBase) {
    apm.observe('transaction:end', (t) => {
      const executionContext = this.executionContext?.get();
      if (executionContext && (t.type === 'route-change' || t.type === 'page-load')) {
        const { name, page } = executionContext;
        t.name = `${name} ${page || 'unknown'}`;
      }
    });
  }
}
