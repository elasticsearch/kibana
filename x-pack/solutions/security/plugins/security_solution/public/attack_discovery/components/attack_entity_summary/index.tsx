/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/react';
import React, { useMemo } from 'react';

import { AttackDiscoveryMarkdownFormatter } from '../../pages/results/attack_discovery_markdown_formatter';
import { FIELD_TOKEN_REGEX } from '../../pages/results/attack_discovery_markdown_formatter/attack_discovery_markdown_parser/helpers';

export const ATTACK_ENTITY_SUMMARY_TEST_ID = 'attack-subtitle-summary-text';

/**
 * Converts attack discovery field markdown (`{{ field.value }}`) to plain text for tooltips.
 */
export const getSummaryPlainText = (markdown: string): string =>
  markdown.replace(FIELD_TOKEN_REGEX, '$2');

/**
 * Constrains the entity summary to a single truncated line.
 * The gradient fade on the right edge prevents any chip from being hard-clipped.
 */
const summaryCss = css`
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 2rem), transparent 100%);

  .euiMarkdownFormat {
    overflow: hidden;
    white-space: nowrap;

    > * {
      display: inline;
    }

    p {
      margin: 0;
    }
  }
`;

interface AttackEntitySummaryProps {
  /** Alert ids the markdown field tokens resolve against */
  alertIds?: string[];
  /** Disables the markdown field hover actions, and the queries backing them */
  disableActions?: boolean;
  /** Already resolved entity summary markdown. Nothing is rendered when it is empty */
  entitySummaryMarkdown?: string;
  /** Scope the markdown field actions are dispatched to */
  scopeId: string;
}

/**
 * Renders the entity summary of an attack as a single clamped line, with the plain text
 * equivalent shown in a tooltip, from a string the caller has already resolved.
 */
export const AttackEntitySummary = React.memo<AttackEntitySummaryProps>(
  ({ alertIds, disableActions = false, entitySummaryMarkdown, scopeId }) => {
    const summaryPlainText = useMemo(
      () =>
        entitySummaryMarkdown != null && entitySummaryMarkdown.length > 0
          ? getSummaryPlainText(entitySummaryMarkdown)
          : null,
      [entitySummaryMarkdown]
    );

    if (entitySummaryMarkdown == null || summaryPlainText == null) {
      return null;
    }

    return (
      <EuiToolTip anchorClassName="eui-fullWidth" content={summaryPlainText} display="block">
        <div css={summaryCss} data-test-subj={ATTACK_ENTITY_SUMMARY_TEST_ID} tabIndex={0}>
          <AttackDiscoveryMarkdownFormatter
            alertIds={alertIds}
            disableActions={disableActions}
            markdown={entitySummaryMarkdown}
            scopeId={scopeId}
          />
        </div>
      </EuiToolTip>
    );
  }
);
AttackEntitySummary.displayName = 'AttackEntitySummary';
