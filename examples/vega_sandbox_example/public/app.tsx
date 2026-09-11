/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCodeBlock,
  EuiCommentList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageTemplate,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  type EuiCommentProps,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { HttpStart } from '@kbn/core/public';
import type { Spec } from 'vega';
import { compile } from 'vega-lite';
import { v4 as uuidv4 } from 'uuid';
import {
  isVegaSandboxOutboundMessage,
  VEGA_SANDBOX_PROTOCOL_VERSION,
  type VegaSandboxApplyFilterMessage,
  type VegaSandboxInboundMessage,
  type VegaSandboxOutboundMessage,
} from '@kbn/vega-sandbox';
import { PLUGIN_NAME, VEGA_SANDBOX_EXAMPLE_FRAME_PATH } from '../common';

const IFRAME_HEIGHT = 360;

interface ChartRow {
  amount: number;
  category: string;
}

const CHART_VALUES: ChartRow[] = [
  { category: 'A', amount: 28 },
  { category: 'B', amount: 55 },
  { category: 'C', amount: 43 },
];

const compileBarChart = (values: ChartRow[], clickToFilter: boolean): Spec => {
  const spec = compile({
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    // visTypeVega's parser defaults to this so width/height include axes and title.
    // Vega-Lite's default is `pad`, which draws those outside the iframe and clips y=0.
    autosize: { type: 'fit', contains: 'padding' },
    title: clickToFilter ? 'Click a bar to send applyFilter' : 'Inline bar chart',
    description: 'Inline bar chart with no Elasticsearch data',
    data: { values },
    mark: clickToFilter
      ? { type: 'bar', cursor: 'pointer', tooltip: true }
      : { type: 'bar', tooltip: true },
    encoding: {
      x: { field: 'category', type: 'nominal', title: 'Category' },
      y: { field: 'amount', type: 'quantitative', title: 'Amount' },
      // Stable SVG aria-label for Scout (and a11y); avoids positional bar clicks.
      description: { field: 'category', type: 'nominal' },
    },
  }).spec as Spec;

  if (!clickToFilter) {
    return spec;
  }

  return {
    ...spec,
    signals: [
      ...(spec.signals ?? []),
      {
        name: 'sendFilter',
        on: [
          {
            events: 'rect:click',
            update: 'kibanaAddFilter({match_phrase:{category: datum.category}})',
          },
        ],
      },
    ],
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Read `category` from a `kibanaAddFilter({ match_phrase: { category } })` intent. */
const categoryFromAddFilter = (
  intent: VegaSandboxApplyFilterMessage['intent']
): string | undefined => {
  if (intent.fn !== 'kibanaAddFilter') {
    return undefined;
  }
  const query = intent.args[0];
  if (!isRecord(query) || !isRecord(query.match_phrase)) {
    return undefined;
  }
  return typeof query.match_phrase.category === 'string' ? query.match_phrase.category : undefined;
};

interface IsolationProbe {
  opaqueOrigin: boolean;
}

const isExampleMessage = (
  value: unknown
): value is { source: 'vega-sandbox-example'; type: string } & Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  (value as { source?: unknown }).source === 'vega-sandbox-example' &&
  typeof (value as { type?: unknown }).type === 'string';

const toDisplayPayload = (message: { type: string }): Record<string, unknown> => {
  const payload = { ...(message as { type: string } & Record<string, unknown>) };
  if (
    payload.type !== 'render' ||
    payload.descriptor == null ||
    typeof payload.descriptor !== 'object'
  ) {
    return payload;
  }
  const descriptor = payload.descriptor as Record<string, unknown>;
  return {
    ...payload,
    descriptor: {
      ...descriptor,
      spec: '[vega spec]',
    },
  };
};

type ProtocolLogEntry =
  | { direction: 'inbound'; message: VegaSandboxInboundMessage }
  | { direction: 'outbound'; message: VegaSandboxOutboundMessage };

const toComment = ({ direction, message }: ProtocolLogEntry): EuiCommentProps => {
  const isInbound = direction === 'inbound';
  const username = isInbound ? 'Parent' : 'Sandbox';
  return {
    username,
    event: message.type,
    eventColor: isInbound ? 'primary' : 'success',
    timelineAvatar: isInbound ? 'chevronSingleRight' : 'chevronSingleLeft',
    timelineAvatarAriaLabel: username,
    children: (
      <EuiCodeBlock language="json" paddingSize="s" overflowHeight={200} isCopyable>
        {JSON.stringify(toDisplayPayload(message), null, 2)}
      </EuiCodeBlock>
    ),
  };
};

interface VegaSandboxExampleAppProps {
  http: HttpStart;
}

export const VegaSandboxExampleApp = ({ http }: VegaSandboxExampleAppProps) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const renderCountRef = useRef(0);
  // Per-instance prefix prevents renderId collisions across multiple panels on a dashboard.
  const renderPrefixRef = useRef(`${uuidv4()}-`);
  const didInitRef = useRef(false);
  const renderSpecRef = useRef<(spec: Spec, extraEntries?: ProtocolLogEntry[]) => void>(() => {});
  const [frameSrc, setFrameSrc] = useState<string | undefined>();
  const [frameEpoch, setFrameEpoch] = useState(0);
  const [frameReady, setFrameReady] = useState(false);
  const [bootstrapFailed, setBootstrapFailed] = useState(false);
  const [protocolLog, setProtocolLog] = useState<ProtocolLogEntry[]>([]);
  const [appliedCategory, setAppliedCategory] = useState<string | undefined>();
  const [iframeHeight, setIframeHeight] = useState(IFRAME_HEIGHT);
  const [isolation, setIsolation] = useState<IsolationProbe | undefined>();

  const appendLog = useCallback((entries: ProtocolLogEntry[]) => {
    setProtocolLog((current) => [...current, ...entries]);
  }, []);

  const postToFrame = useCallback((message: VegaSandboxInboundMessage) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*');
  }, []);

  const renderSpec = useCallback(
    (spec: Spec, extraEntries: ProtocolLogEntry[] = []) => {
      const iframe = iframeRef.current;
      renderCountRef.current += 1;
      const renderId = `${renderPrefixRef.current}${renderCountRef.current}`;
      const inbound: VegaSandboxInboundMessage[] = [];
      if (!didInitRef.current) {
        didInitRef.current = true;
        inbound.push({
          type: 'init',
          protocolVersion: VEGA_SANDBOX_PROTOCOL_VERSION,
          // Demo-only. visTypeVega will serialize EUI `.vgaVis__tooltip` styles instead.
          tooltipCss: `
.vgaVis__tooltip {
  background: #1d1e24;
  color: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  font: 12px/1.4 sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  z-index: 1;
}
.vgaVis__tooltip table { border-collapse: collapse; }
.vgaVis__tooltip td { padding: 2px 4px; }
.vgaVis__tooltip td.key { text-align: right; opacity: 0.75; }
`,
        });
      }
      inbound.push({
        type: 'render',
        renderId,
        dimensions: {
          width: iframe?.clientWidth,
          height: iframe?.clientHeight ?? IFRAME_HEIGHT,
        },
        descriptor: {
          spec,
          renderer: 'svg',
          useHover: true,
          useResize: true,
          tooltips: { position: 'top' },
        },
      });
      appendLog([
        ...extraEntries,
        ...inbound.map((message) => ({ direction: 'inbound' as const, message })),
      ]);
      for (const message of inbound) {
        postToFrame(message);
      }
    },
    [appendLog, postToFrame]
  );
  renderSpecRef.current = renderSpec;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Authenticate source: only accept messages from our own sandbox iframe.
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (isExampleMessage(event.data)) {
        if (event.data.type === 'isolationProbe') {
          setIsolation({
            opaqueOrigin: event.data.opaqueOrigin === true,
          });
        }
        if (event.data.type === 'bootstrapReady') {
          didInitRef.current = false;
          setBootstrapFailed(false);
          setFrameReady(true);
        }
        if (event.data.type === 'bootstrapError') {
          // Log for developer diagnostics. Production hosts (visTypeVega) should also
          // call window.elasticApm?.captureError() to surface this in APM.
          // eslint-disable-next-line no-console
          console.error(
            '[vega-sandbox] Bootstrap bundle failed to load. Ensure the package has been built.'
          );
          setBootstrapFailed(true);
        }
        return;
      }
      if (!isVegaSandboxOutboundMessage(event.data)) {
        return;
      }
      if (event.data.type === 'applyFilter') {
        const category = categoryFromAddFilter(event.data.intent);
        if (category !== undefined) {
          setAppliedCategory(category);
          renderSpecRef.current(
            compileBarChart(
              CHART_VALUES.filter((row) => row.category === category),
              true
            ),
            [{ direction: 'outbound', message: event.data }]
          );
          return;
        }
      }
      appendLog([{ direction: 'outbound', message: event.data }]);
    };

    window.addEventListener('message', onMessage);
    setFrameSrc(http.basePath.prepend(VEGA_SANDBOX_EXAMPLE_FRAME_PATH));
    return () => window.removeEventListener('message', onMessage);
  }, [appendLog, http]);

  const onRender = () => {
    setAppliedCategory(undefined);
    renderSpec(compileBarChart(CHART_VALUES, false));
  };

  const onRenderFilter = () => {
    setAppliedCategory(undefined);
    renderSpec(compileBarChart(CHART_VALUES, true));
  };

  const onResize = () => {
    const iframe = iframeRef.current;
    const nextHeight = iframeHeight === IFRAME_HEIGHT ? 520 : IFRAME_HEIGHT;
    setIframeHeight(nextHeight);
    const message: VegaSandboxInboundMessage = {
      type: 'resize',
      dimensions: {
        width: iframe?.clientWidth,
        height: nextHeight,
      },
    };
    appendLog([{ direction: 'inbound', message }]);
    postToFrame(message);
  };

  const onReset = () => {
    renderCountRef.current = 0;
    renderPrefixRef.current = `${uuidv4()}-`;
    didInitRef.current = false;
    setProtocolLog([]);
    setAppliedCategory(undefined);
    setIframeHeight(IFRAME_HEIGHT);
    setIsolation(undefined);
    setBootstrapFailed(false);
    setFrameReady(false);
    setFrameEpoch((current) => current + 1);
  };

  const isolationLabel = isolation
    ? isolation.opaqueOrigin
      ? 'opaque origin (isolated)'
      : 'non-opaque origin (fail)'
    : undefined;

  return (
    <EuiPageTemplate>
      <EuiPageTemplate.Header>
        <EuiTitle size="l">
          <h1 data-test-subj="vegaSandboxExampleHeader">{PLUGIN_NAME}</h1>
        </EuiTitle>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section>
        <EuiText>
          <p>
            Protocol playground for <code>@kbn/vega-sandbox</code>. This is not the production
            visTypeVega host. <strong>Render</strong> draws a Vega-Lite bar chart; hover a bar for a
            tooltip. <strong>Render filter example</strong> is the same chart with clickable bars:
            the spec posts <code>applyFilter</code>, this page filters the inline data, and it sends
            a new <code>render</code>. visTypeVega would apply Kibana filters and refetch
            Elasticsearch instead. <strong>Resize</strong> toggles the iframe height and posts{' '}
            <code>resize</code> with the new dimensions; it does not trigger another{' '}
            <code>rendered</code>. <strong>Reset</strong> reloads the iframe and clears the log.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={onRender}
              isDisabled={!frameReady}
              data-test-subj="vegaSandboxExampleRenderBtn"
            >
              Render
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={onRenderFilter}
              isDisabled={!frameReady}
              data-test-subj="vegaSandboxExampleFilterBtn"
            >
              Render filter example
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={onResize}
              isDisabled={!frameReady}
              data-test-subj="vegaSandboxExampleResizeBtn"
            >
              Resize
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              onClick={onReset}
              isDisabled={!frameSrc}
              data-test-subj="vegaSandboxExampleResetBtn"
            >
              Reset
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        {bootstrapFailed ? (
          <EuiText color="danger" data-test-subj="vegaSandboxExampleBootstrapError">
            <p>Visualization sandbox failed to load.</p>
          </EuiText>
        ) : null}
        {isolation ? (
          <EuiText data-test-subj="vegaSandboxExampleIsolationProbe">
            <p>
              Isolation: <strong>{isolationLabel}</strong>
            </p>
          </EuiText>
        ) : null}
        {appliedCategory ? (
          <>
            <EuiSpacer size="s" />
            <EuiText data-test-subj="vegaSandboxExampleAppliedFilter" size="s">
              <p>
                Parent applied filter <code>category:{appliedCategory}</code> to the inline data and
                sent a new <code>render</code>.
              </p>
            </EuiText>
          </>
        ) : null}
        <EuiSpacer />
        <EuiText size="s">
          <p>
            Each inbound <code>render</code> carries a <code>renderId</code>. The sandbox replies
            with <code>rendered</code> using that id, the completion signal. visTypeVega will call{' '}
            <code>handlers.done()</code> on a matching <code>rendered</code>, which PNG and PDF
            reporting wait on. This example only logs the messages.
          </p>
        </EuiText>
        <EuiSpacer />
        <EuiFlexGroup alignItems="stretch">
          <EuiFlexItem grow={6}>
            {frameSrc ? (
              <iframe
                key={frameEpoch}
                ref={iframeRef}
                title="Vega sandbox"
                sandbox="allow-scripts"
                src={frameSrc}
                width="100%"
                height={iframeHeight}
                data-test-subj="vegaSandboxExampleFrame"
              />
            ) : null}
          </EuiFlexItem>
          <EuiFlexItem grow={4}>
            <EuiPanel
              hasBorder
              hasShadow={false}
              paddingSize="m"
              css={css`
                height: ${iframeHeight}px;
                display: flex;
                flex-direction: column;
                min-width: 0;
              `}
            >
              <EuiTitle size="xs">
                <h2>Protocol messages</h2>
              </EuiTitle>
              <EuiSpacer size="s" />
              <div
                data-test-subj="vegaSandboxExampleProtocolLog"
                css={css`
                  flex: 1 1 auto;
                  min-height: 0;
                  overflow-y: auto;
                `}
              >
                {protocolLog.length === 0 ? (
                  <EuiText size="s">
                    <p>(none yet)</p>
                  </EuiText>
                ) : (
                  <EuiCommentList comments={protocolLog.map(toComment)} />
                )}
              </div>
            </EuiPanel>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );
};
