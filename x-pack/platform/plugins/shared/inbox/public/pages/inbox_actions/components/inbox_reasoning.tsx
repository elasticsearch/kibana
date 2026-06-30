/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiAccordion,
  EuiCodeBlock,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { InboxAction } from '@kbn/inbox-common';
import * as i18n from '../translations';

/**
 * Loose "soft-interface" reasoning shape. Resolved server-side from the
 * `output` of the step that ran immediately before the `waitForInput` (see
 * `resolvePredecessorReasoning` in the workflows plugin). The contract is
 * intentionally permissive — workflow authors who emit a `reasoning` object
 * of roughly this shape get a richer render; anything else falls back to a
 * raw JSON block so nothing is silently hidden.
 */
interface ReasoningSection {
  title?: string;
  body?: string;
  /** Optional fenced code/snippet rendered verbatim under the section body. */
  code?: string;
}

interface ReasoningShape {
  summary?: string;
  details?: string;
  sections?: ReasoningSection[];
}

const asReasoningShape = (value: unknown): ReasoningShape | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as ReasoningShape;
};

const hasStructuredReasoning = (reasoning: ReasoningShape): boolean =>
  typeof reasoning.summary === 'string' ||
  typeof reasoning.details === 'string' ||
  (Array.isArray(reasoning.sections) && reasoning.sections.length > 0);

export interface InboxReasoningProps {
  reasoning: InboxAction['reasoning'];
}

/**
 * Renders the soft-interface reasoning attached to an inbox action — a short
 * summary line plus a collapsible "Full reasoning" panel holding ordered
 * sections (e.g. DIAGNOSIS / DECISION RATIONALE / CHANGES MADE) and any code
 * snippets. Unknown shapes degrade to a copyable JSON block. Returns `null`
 * when no reasoning is present so callers can render it unconditionally.
 */
export const InboxReasoning: React.FC<InboxReasoningProps> = ({ reasoning }) => {
  const accordionId = useGeneratedHtmlId({ prefix: 'inboxReasoning' });
  const parsed = asReasoningShape(reasoning);

  if (!parsed) {
    return null;
  }

  const structured = hasStructuredReasoning(parsed);
  const sections = Array.isArray(parsed.sections) ? parsed.sections : [];
  const hasExpandable = typeof parsed.details === 'string' || sections.length > 0;

  return (
    <EuiFlexItem data-test-subj="inboxReasoning">
      <EuiText size="xs" color="subdued">
        <strong>{i18n.REASONING_LABEL}</strong>
      </EuiText>
      {structured ? (
        <>
          {parsed.summary ? (
            <EuiText size="s" data-test-subj="inboxReasoningSummary">
              <p>{parsed.summary}</p>
            </EuiText>
          ) : null}
          {hasExpandable ? (
            <EuiAccordion
              id={accordionId}
              buttonContent={i18n.REASONING_FULL_LABEL}
              paddingSize="s"
              data-test-subj="inboxReasoningAccordion"
            >
              {parsed.details ? (
                <EuiText size="s">
                  <p>{parsed.details}</p>
                </EuiText>
              ) : null}
              {sections.map((section, index) => (
                <div
                  key={`${section.title ?? 'untitled'}-${index}`}
                  data-test-subj="inboxReasoningSection"
                >
                  {section.title ? (
                    <EuiText size="xs" color="subdued">
                      <strong>{section.title}</strong>
                    </EuiText>
                  ) : null}
                  {section.body ? (
                    <EuiText size="s">
                      <p>{section.body}</p>
                    </EuiText>
                  ) : null}
                  {section.code ? (
                    <EuiCodeBlock language="text" fontSize="s" paddingSize="s" isCopyable>
                      {section.code}
                    </EuiCodeBlock>
                  ) : null}
                  {index < sections.length - 1 ? <EuiSpacer size="s" /> : null}
                </div>
              ))}
            </EuiAccordion>
          ) : null}
        </>
      ) : (
        <EuiCodeBlock language="json" fontSize="s" paddingSize="s" isCopyable>
          {JSON.stringify(reasoning, null, 2)}
        </EuiCodeBlock>
      )}
    </EuiFlexItem>
  );
};
