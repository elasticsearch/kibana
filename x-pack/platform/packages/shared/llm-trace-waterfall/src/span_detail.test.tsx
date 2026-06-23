/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SpanDetail } from './span_detail';
import type { SpanNode } from './types';

const buildSpanNode = (overrides: Partial<SpanNode> = {}): SpanNode => ({
  span_id: 'span-1',
  trace_id: 'trace-abc',
  name: 'test-span',
  start_time: '2025-06-01T00:00:00Z',
  duration_ms: 42.5,
  kind: 'INTERNAL',
  status: 'OK',
  children: [],
  depth: 0,
  ...overrides,
});

describe('SpanDetail', () => {
  it('renders span name and basic metadata', () => {
    const span = buildSpanNode({ name: 'llm.chat', duration_ms: 123.4, kind: 'CLIENT' });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('llm.chat')).toBeInTheDocument();
    expect(screen.getByText('123.4ms')).toBeInTheDocument();
    expect(screen.getByText('CLIENT')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<SpanDetail span={buildSpanNode()} onClose={onClose} />);

    const closeButton = screen.getByLabelText('Close detail');
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders token stats when gen_ai.usage attributes are present', () => {
    const span = buildSpanNode({
      attributes: {
        'gen_ai.usage.input_tokens': 500,
        'gen_ai.usage.output_tokens': 200,
        'gen_ai.usage.total_tokens': 700,
      },
    });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('700')).toBeInTheDocument();
    expect(screen.getByText('Input tokens')).toBeInTheDocument();
    expect(screen.getByText('Output tokens')).toBeInTheDocument();
    expect(screen.getByText('Total tokens')).toBeInTheDocument();
  });

  it('does not render token stats when no usage attributes', () => {
    const span = buildSpanNode({ attributes: {} });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.queryByText('Input tokens')).not.toBeInTheDocument();
  });

  it('renders prompt ID badge when gen_ai.prompt.id is present', () => {
    const span = buildSpanNode({
      attributes: { 'gen_ai.prompt.id': 'alert-summarization' },
    });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('alert-summarization')).toBeInTheDocument();
  });

  it('renders model name when gen_ai.request.model is present', () => {
    const span = buildSpanNode({
      attributes: { 'gen_ai.request.model': 'gpt-4' },
    });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('renders tool input/output sections', () => {
    const span = buildSpanNode({
      attributes: {
        'gen_ai.tool.call.arguments': { query: 'test' },
        'output.value': { result: 'success' },
      },
    });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('Tool Input')).toBeInTheDocument();
    expect(screen.getByText('Tool Output')).toBeInTheDocument();
  });

  it('shows "No input/output data available" when no IO attributes present', () => {
    const span = buildSpanNode({ attributes: {} });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('No input/output data available for this span.')).toBeInTheDocument();
  });

  it('renders copy span ID button', () => {
    render(<SpanDetail span={buildSpanNode()} onClose={jest.fn()} />);

    expect(screen.getByLabelText('Copy span ID')).toBeInTheDocument();
  });

  it('renders LLM attributes when present', () => {
    const span = buildSpanNode({
      attributes: {
        'gen_ai.system': 'openai',
        'gen_ai.operation.name': 'chat',
      },
    });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('LLM Attributes')).toBeInTheDocument();
    expect(screen.getByText('gen_ai.system')).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
  });

  it('renders tabbed layout when useTabs is true', () => {
    const span = buildSpanNode({
      attributes: {
        'gen_ai.system': 'openai',
        'output.value': 'some output',
      },
    });
    render(<SpanDetail span={span} onClose={jest.fn()} useTabs />);

    expect(screen.getByText('Input / Output')).toBeInTheDocument();
    expect(screen.getByText('Attributes')).toBeInTheDocument();
  });

  it('handles span with no attributes gracefully', () => {
    const span = buildSpanNode({ attributes: undefined });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    expect(screen.getByText('test-span')).toBeInTheDocument();
    expect(screen.getByText('No input/output data available for this span.')).toBeInTheDocument();
  });

  it('renders dash when kind or status is not provided', () => {
    const span = buildSpanNode({ kind: undefined, status: undefined });
    render(<SpanDetail span={span} onClose={jest.fn()} />);

    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
