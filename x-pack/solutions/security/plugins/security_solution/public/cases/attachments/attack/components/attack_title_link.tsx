/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';
import {
  ATTACK_TAB_COLUMN_TITLE_TEST_ID,
  ATTACK_TAB_ROW_TITLE_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';
import { TruncatableText } from '../../../../common/components/truncatable_text';
import { useOpenAttackFlyout } from '../hooks/use_open_attack_flyout';

export interface AttackTitleLinkProps {
  /** The attack document `_id`, persisted as the attachment id. */
  attackId: string;
  /** The index the attack lives in, from the live document or the attachment metadata. */
  indexName: string;
  /** The attack's de-anonymised title. */
  title: string;
}

/**
 * The title of a resolved attack, built like the alerts grid's rule cell: a truncated link that
 * opens the document it names.
 */
export const AttackTitleLink = ({ attackId, indexName, title }: AttackTitleLinkProps) => {
  const openAttackFlyout = useOpenAttackFlyout({ attackId, indexName, attackTitle: title });

  return (
    <EuiLink data-test-subj={ATTACK_TAB_COLUMN_TITLE_TEST_ID} onClick={openAttackFlyout}>
      <TruncatableText dataTestSubj={ATTACK_TAB_ROW_TITLE_TEST_ID}>{title}</TruncatableText>
    </EuiLink>
  );
};

AttackTitleLink.displayName = 'AttackTitleLink';
