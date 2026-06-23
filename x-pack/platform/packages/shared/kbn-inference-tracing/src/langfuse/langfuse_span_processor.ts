/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { tracing } from '@elastic/opentelemetry-node/sdk';
import type { InferenceTracingLangfuseExportConfig } from '@kbn/inference-tracing-config';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { memoize, omit, partition } from 'lodash';
import { diag } from '@opentelemetry/api';
import { BaseInferenceSpanProcessor } from '../base_inference_span_processor';
import { unflattenAttributes } from '../util/unflatten_attributes';

export class LangfuseSpanProcessor extends BaseInferenceSpanProcessor {
  private getProjectId: () => Promise<string | undefined>;
  constructor(private readonly config: InferenceTracingLangfuseExportConfig) {
    const headers = {
      Authorization: `Basic ${Buffer.from(`${config.public_key}:${config.secret_key}`).toString(
        'base64'
      )}`,
    };

    const exporter = new OTLPTraceExporter({
      url: `${config.base_url}/api/public/otel/v1/traces`,
      headers,
    });

    super(exporter, config.scheduled_delay);

    const getProjectIdMemoized = memoize(async () => {
      const base = new URL(config.base_url);

      const { data } = await fetch(new URL('/api/public/projects', base), { headers }).then(
        (response) => response.json() as Promise<{ data: Array<{ id: string; name: string }> }>
      );

      return data?.[0]?.id;
    });

    this.getProjectId = () => {
      return getProjectIdMemoized().catch((error) => {
        diag.error(`Could not get project ID from Langfuse: ${error.message}`);
        getProjectIdMemoized.cache.clear?.();
        return undefined;
      });
    };
  }

  override processInferenceSpan(span: tracing.ReadableSpan): tracing.ReadableSpan {
    // Langfuse doesn't understand fully semconv-compliant span events
    // yet, so we translate to a format it does understand. see
    // https://github.com/langfuse/langfuse/blob/c1c22a9b9b684bd45ca9436556c2599d5a23271d/web/src/features/otel/server/index.ts#L476
    if (span.attributes['gen_ai.operation.name'] === 'chat') {
      const [inputEvents, outputEvents] = partition(
        span.events,
        (event) => event.name !== 'gen_ai.choice'
      );

      span.attributes['input.value'] = JSON.stringify(
        inputEvents.map((event) => {
          return unflattenAttributes(event.attributes ?? {});
        })
      );

      span.attributes['output.value'] = JSON.stringify(
        outputEvents.map((event) => {
          const { message, ...rest } = unflattenAttributes(event.attributes ?? {});
          return {
            ...omit(rest, 'finish_reason', 'index'),
            ...message,
          };
        })[0]
      );
    }

    if (span.attributes['gen_ai.operation.name'] === 'execute_tool') {
      const toolResult = span.attributes['gen_ai.tool.call.result'];
      if (toolResult) {
        span.attributes['output.value'] = String(toolResult);
      }
      const toolArgs = span.attributes['gen_ai.tool.call.arguments'];
      if (toolArgs) {
        span.attributes['input.value'] = String(toolArgs);
      }
    }

    if (!span.parentSpanContext) {
      const traceId = span.spanContext().traceId;
      void this.getProjectId().then((projectId) => {
        // this is how Langfuse generates IDs, see
        // https://github.com/langfuse/langfuse/blob/2d4708921c67bca61c774633b7df65b3c5105f0d/web/src/features/otel/server/index.ts#L506
        const langfuseTraceId = Buffer.from(traceId).toString('hex');
        const url = new URL(
          `/project/${projectId}/traces/${langfuseTraceId}`,
          new URL(this.config.base_url)
        );
        diag.info(`View trace at ${url.toString()}`);
      });
    }

    return span;
  }
}
