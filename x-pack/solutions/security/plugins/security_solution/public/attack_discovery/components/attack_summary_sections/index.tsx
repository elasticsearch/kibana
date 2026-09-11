/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer, EuiTitle } from '@elastic/eui';
import React, { useMemo } from 'react';

import { getTacticMetadata } from '../../helpers';
import { AttackChain } from '../../pages/results/attack_discovery_panel/tabs/attack_discovery_tab/attack/attack_chain';
import { AttackDiscoveryMarkdownFormatter } from '../../pages/results/attack_discovery_markdown_formatter';

import * as i18n from './translations';

export const SUMMARY_CONTENT_TEST_ID = 'summaryContent';
export const DETAILS_TITLE_TEST_ID = 'detailsTitle';
export const DETAILS_CONTENT_TEST_ID = 'detailsContent';
export const ATTACK_CHAIN_TITLE_TEST_ID = 'attackChainTitle';

interface AttackSummarySectionsProps {
  /** Alert ids the markdown field tokens resolve against */
  alertIds?: string[];
  /** Optional `data-test-subj` for the wrapping element */
  dataTestSubj?: string;
  /** Already resolved details markdown. The `Details` section is skipped when empty */
  detailsMarkdown?: string;
  /** Disables the markdown field hover actions, and the queries backing them */
  disableActions?: boolean;
  /** MITRE ATT&CK tactics used to render the attack chain */
  mitreAttackTactics?: string[];
  /** Scope the markdown field actions are dispatched to */
  scopeId: string;
  /** Already resolved summary markdown */
  summaryMarkdown: string;
}

/**
 * Renders the summary markdown, the `Details` section and the MITRE ATT&CK chain of an attack,
 * from strings the caller has already resolved. Renders no calls to action.
 */
export const AttackSummarySections = React.memo<AttackSummarySectionsProps>(
  ({
    alertIds,
    dataTestSubj,
    detailsMarkdown,
    disableActions = false,
    mitreAttackTactics,
    scopeId,
    summaryMarkdown,
  }) => {
    const tacticMetadata = useMemo(
      () => getTacticMetadata(mitreAttackTactics),
      [mitreAttackTactics]
    );

    return (
      <div data-test-subj={dataTestSubj}>
        <EuiSpacer size="s" />

        <div data-test-subj={SUMMARY_CONTENT_TEST_ID}>
          <AttackDiscoveryMarkdownFormatter
            scopeId={scopeId}
            disableActions={disableActions}
            markdown={summaryMarkdown}
            alertIds={alertIds}
          />
        </div>

        <EuiSpacer />

        {detailsMarkdown != null && detailsMarkdown.length > 0 && (
          <>
            <EuiTitle data-test-subj={DETAILS_TITLE_TEST_ID} size="xs">
              <h2>{i18n.DETAILS}</h2>
            </EuiTitle>
            <EuiSpacer size="s" />

            <div data-test-subj={DETAILS_CONTENT_TEST_ID}>
              <AttackDiscoveryMarkdownFormatter
                scopeId={scopeId}
                disableActions={disableActions}
                markdown={detailsMarkdown}
                alertIds={alertIds}
              />
            </div>

            <EuiSpacer />
          </>
        )}

        {tacticMetadata.length > 0 && (
          <>
            <EuiTitle data-test-subj={ATTACK_CHAIN_TITLE_TEST_ID} size="xs">
              <h2>{i18n.ATTACK_CHAIN}</h2>
            </EuiTitle>
            <EuiSpacer size="s" />
            <AttackChain attackTactics={mitreAttackTactics} />
            <EuiSpacer size="l" />
          </>
        )}
      </div>
    );
  }
);
AttackSummarySections.displayName = 'AttackSummarySections';
