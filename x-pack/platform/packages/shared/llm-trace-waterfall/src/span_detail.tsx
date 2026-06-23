/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiSpacer,
  EuiPanel,
  EuiButtonIcon,
  EuiAccordion,
  EuiCodeBlock,
  EuiCopy,
  EuiStat,
  EuiTabbedContent,
  type EuiTabbedContentTab,
  EuiToolTip,
} from '@elastic/eui';
import type { SpanNode } from './types';
import { SPAN_COLORS, getSpanCategory } from './waterfall_item';
import * as i18n from './translations';

interface CategorizedAttrs {
  tokens: { input?: number; output?: number; total?: number };
  toolInput?: string;
  toolOutput?: string;
  promptId?: string;
  model?: string;
  promptTemplate?: string;
  promptVariables?: string;
  llm: Record<string, unknown>;
  http: Record<string, unknown>;
  resource: Record<string, unknown>;
  other: Record<string, unknown>;
}

const PROMOTED_KEYS = new Set([
  'gen_ai.usage.input_tokens',
  'gen_ai.usage.output_tokens',
  'gen_ai.usage.total_tokens',
  'gen_ai.tool.call.arguments',
  'tool.parameters',
  'output.value',
  'gen_ai.prompt.id',
  'gen_ai.request.model',
  'gen_ai.response.model',
  'gen_ai.prompt.template.template',
  'gen_ai.prompt.template.variables',
]);

const categorizeAttributes = (attrs: Record<string, unknown>): CategorizedAttrs => {
  const result: CategorizedAttrs = {
    tokens: {},
    llm: {},
    http: {},
    resource: {},
    other: {},
  };

  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'gen_ai.usage.input_tokens') {
      result.tokens.input = value as number;
    } else if (key === 'gen_ai.usage.output_tokens') {
      result.tokens.output = value as number;
    } else if (key === 'gen_ai.usage.total_tokens') {
      result.tokens.total = value as number;
    } else if (key === 'gen_ai.tool.call.arguments' || key === 'tool.parameters') {
      result.toolInput = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    } else if (key === 'output.value') {
      result.toolOutput =
        typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    } else if (key === 'gen_ai.prompt.id') {
      result.promptId = String(value);
    } else if (key === 'gen_ai.request.model' || key === 'gen_ai.response.model') {
      if (!result.model) result.model = String(value);
    } else if (key === 'gen_ai.prompt.template.template') {
      result.promptTemplate = String(value);
    } else if (key === 'gen_ai.prompt.template.variables') {
      result.promptVariables =
        typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    } else if (PROMOTED_KEYS.has(key)) {
      continue;
    } else if (key.startsWith('gen_ai.') || key.startsWith('llm.')) {
      result.llm[key] = value;
    } else if (
      key.startsWith('http.') ||
      key.startsWith('url.') ||
      key.startsWith('net.') ||
      key.startsWith('server.')
    ) {
      result.http[key] = value;
    } else if (key.startsWith('resource.')) {
      result.resource[key] = value;
    } else {
      result.other[key] = value;
    }
  }

  return result;
};

const tryFormatJson = (value: string): string => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};

const AttrTable: React.FC<{ attrs: Record<string, unknown> }> = ({ attrs }) => (
  <table style={{ fontSize: '12px', width: '100%' }}>
    <tbody>
      {Object.entries(attrs).map(([key, value]) => {
        const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return (
          <tr key={key}>
            <td
              style={{
                fontWeight: 'bold',
                padding: '2px 8px 2px 0',
                whiteSpace: 'nowrap',
                verticalAlign: 'top',
              }}
            >
              {key}
            </td>
            <td style={{ padding: '2px 0', wordBreak: 'break-all' }}>
              <EuiFlexGroup gutterSize="xs" alignItems="flexStart" responsive={false}>
                <EuiFlexItem>{strValue}</EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiCopy textToCopy={strValue}>
                    {(copy) => (
                      <EuiToolTip
                        content={i18n.getCopyAttributeAriaLabel(key)}
                        disableScreenReaderOutput
                      >
                        <EuiButtonIcon
                          iconType="copy"
                          aria-label={i18n.getCopyAttributeAriaLabel(key)}
                          onClick={copy}
                          size="xs"
                          color="text"
                          style={{ opacity: 0.4 }}
                        />
                      </EuiToolTip>
                    )}
                  </EuiCopy>
                </EuiFlexItem>
              </EuiFlexGroup>
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

interface SpanDetailProps {
  span: SpanNode;
  onClose: () => void;
  useTabs?: boolean;
}

export const SpanDetail: React.FC<SpanDetailProps> = ({ span, onClose, useTabs = false }) => {
  const categorized = useMemo(() => categorizeAttributes(span.attributes ?? {}), [span.attributes]);
  const hasTokens =
    categorized.tokens.input != null ||
    categorized.tokens.output != null ||
    categorized.tokens.total != null;

  const category = getSpanCategory(span);

  const header = (
    <>
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <span
                style={{
                  display: 'inline-block',
                  width: 4,
                  height: 20,
                  borderRadius: 2,
                  backgroundColor: SPAN_COLORS[category],
                  flexShrink: 0,
                }}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s">
                <h4 style={{ margin: 0 }}>{span.name}</h4>
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={i18n.CLOSE_DETAIL_ARIA} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="cross"
              aria-label={i18n.CLOSE_DETAIL_ARIA}
              onClick={onClose}
              size="s"
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>{i18n.DURATION_LABEL}</strong> {(span.duration_ms ?? 0).toFixed(1)}ms
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>{i18n.KIND_LABEL}</strong> {span.kind ?? '-'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <strong>{i18n.STATUS_LABEL}</strong> {span.status ?? '-'}
          </EuiText>
        </EuiFlexItem>
        {categorized.promptId && (
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <strong>{i18n.PROMPT_ID_LABEL}</strong>{' '}
              <EuiBadge color="hollow">{categorized.promptId}</EuiBadge>
            </EuiText>
          </EuiFlexItem>
        )}
        {categorized.model && (
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              <strong>{i18n.MODEL_LABEL}</strong> {categorized.model}
            </EuiText>
          </EuiFlexItem>
        )}
        <EuiFlexItem grow={false}>
          <EuiCopy textToCopy={span.span_id}>
            {(copy) => (
              <EuiToolTip content={i18n.COPY_SPAN_ID_ARIA} disableScreenReaderOutput>
                <EuiButtonIcon
                  iconType="copy"
                  aria-label={i18n.COPY_SPAN_ID_ARIA}
                  onClick={copy}
                  size="xs"
                  color="text"
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiFlexItem>
      </EuiFlexGroup>

      {hasTokens && (
        <>
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="m" responsive={false}>
            {categorized.tokens.input != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(categorized.tokens.input)}
                  description={i18n.INPUT_TOKENS_DESC}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
            {categorized.tokens.output != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(categorized.tokens.output)}
                  description={i18n.OUTPUT_TOKENS_DESC}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
            {categorized.tokens.total != null && (
              <EuiFlexItem>
                <EuiStat
                  title={String(categorized.tokens.total)}
                  description={i18n.TOTAL_TOKENS_DESC}
                  titleSize="xxs"
                  isLoading={false}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </>
      )}
    </>
  );

  const hasIoData =
    categorized.toolInput ||
    categorized.toolOutput ||
    categorized.promptTemplate ||
    categorized.promptVariables;

  const ioContent = (
    <>
      {categorized.promptTemplate && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`prompt-template-${span.span_id}`}
            buttonContent={i18n.PROMPT_TEMPLATE_HEADING}
            paddingSize="xs"
          >
            <EuiCodeBlock
              language="handlebars"
              fontSize="s"
              paddingSize="s"
              overflowHeight={200}
              isCopyable
            >
              {categorized.promptTemplate}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      )}
      {categorized.promptVariables && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`prompt-vars-${span.span_id}`}
            buttonContent={i18n.PROMPT_VARIABLES_HEADING}
            paddingSize="xs"
          >
            <EuiCodeBlock
              language="json"
              fontSize="s"
              paddingSize="s"
              overflowHeight={200}
              isCopyable
            >
              {tryFormatJson(categorized.promptVariables)}
            </EuiCodeBlock>
          </EuiAccordion>
        </>
      )}
      {categorized.toolInput && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs">
            <h5>{i18n.TOOL_INPUT_HEADING}</h5>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language="json"
            fontSize="s"
            paddingSize="s"
            overflowHeight={200}
            isCopyable
          >
            {tryFormatJson(categorized.toolInput)}
          </EuiCodeBlock>
        </>
      )}
      {categorized.toolOutput && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs">
            <h5>{i18n.TOOL_OUTPUT_HEADING}</h5>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiCodeBlock
            language="json"
            fontSize="s"
            paddingSize="s"
            overflowHeight={200}
            isCopyable
          >
            {tryFormatJson(categorized.toolOutput)}
          </EuiCodeBlock>
        </>
      )}
      {!hasIoData && (
        <EuiText size="xs" color="subdued">
          {i18n.NO_IO_DATA}
        </EuiText>
      )}
    </>
  );

  const attributesContent = (
    <>
      {Object.keys(categorized.llm).length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiText size="xs">
            <h5>{i18n.LLM_ATTRIBUTES_HEADING}</h5>
          </EuiText>
          <EuiSpacer size="xs" />
          <AttrTable attrs={categorized.llm} />
        </>
      )}
      {Object.keys(categorized.http).length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`http-${span.span_id}`}
            buttonContent={i18n.HTTP_ATTRIBUTES_HEADING}
            paddingSize="xs"
          >
            <AttrTable attrs={categorized.http} />
          </EuiAccordion>
        </>
      )}
      {Object.keys(categorized.other).length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`other-${span.span_id}`}
            buttonContent={i18n.getOtherAttributesHeading(Object.keys(categorized.other).length)}
            paddingSize="xs"
          >
            <AttrTable attrs={categorized.other} />
          </EuiAccordion>
        </>
      )}
      {Object.keys(categorized.resource).length > 0 && (
        <>
          <EuiSpacer size="s" />
          <EuiAccordion
            id={`resource-${span.span_id}`}
            buttonContent={i18n.getResourceAttributesHeading(
              Object.keys(categorized.resource).length
            )}
            paddingSize="xs"
          >
            <AttrTable attrs={categorized.resource} />
          </EuiAccordion>
        </>
      )}
    </>
  );

  if (useTabs) {
    const tabs: EuiTabbedContentTab[] = [
      {
        id: 'io',
        name: i18n.IO_TAB_LABEL,
        content: <div style={{ padding: '8px 0' }}>{ioContent}</div>,
      },
      {
        id: 'attributes',
        name: i18n.ATTRIBUTES_TAB_LABEL,
        content: <div style={{ padding: '8px 0' }}>{attributesContent}</div>,
      },
    ];

    return (
      <EuiPanel hasBorder hasShadow={false} paddingSize="s">
        {header}
        <EuiSpacer size="s" />
        <EuiTabbedContent tabs={tabs} initialSelectedTab={tabs[0]} size="s" />
      </EuiPanel>
    );
  }

  return (
    <EuiPanel hasBorder hasShadow={false} paddingSize="s">
      {header}
      {ioContent}
      {attributesContent}
    </EuiPanel>
  );
};
