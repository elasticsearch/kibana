/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback } from 'react';
import { EuiContextMenuItem } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EntityToAttach } from '..';
import { generateEntityAttachmentsWithoutOwner } from '..';
import { useKibana } from '../../../../common/lib/kibana';

export interface AddToNewCaseProps {
  /**
   * Entity used to generate an attachment to a new case.
   */
  entity: EntityToAttach;
  /**
   * Click event to close the popover in the parent component.
   */
  onClick: () => void;
  /**
   * Used for unit and e2e tests.
   */
  ['data-test-subj']?: string;
}

/**
 * Leverages the cases plugin api to display a flyout to create a new case.
 * Once a case is created, an entity attachment is added to it and a confirmation
 * snackbar presents a link to view the case.
 *
 * Visibility is gated by the caller (see {@link useEntityCaseTakeActionItems}), which
 * only renders this item when the user has the required Cases permissions.
 *
 * Renders an {@link EuiContextMenuItem}.
 */
export const AddToNewCase: FC<AddToNewCaseProps> = ({
  entity,
  onClick,
  'data-test-subj': dataTestSubj,
}) => {
  const { cases } = useKibana().services;
  const createCaseFlyout = cases.hooks.useCasesAddToNewCaseFlyout();

  const menuItemClicked = useCallback(() => {
    onClick();
    createCaseFlyout.open({ attachments: generateEntityAttachmentsWithoutOwner(entity) });
  }, [createCaseFlyout, entity, onClick]);

  return (
    <EuiContextMenuItem onClick={menuItemClicked} data-test-subj={dataTestSubj}>
      <FormattedMessage
        defaultMessage="Add to new case"
        id="xpack.securitySolution.entityAnalytics.cases.addToNewCase"
      />
    </EuiContextMenuItem>
  );
};
