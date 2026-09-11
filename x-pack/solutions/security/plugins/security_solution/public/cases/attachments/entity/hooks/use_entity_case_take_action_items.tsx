/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';
import { useKibana } from '../../../../common/lib/kibana';
import type { EntityToAttach } from '..';
import { AddToCase } from '../components/add_to_case';
import { ADD_TO_CASE_TEST_ID } from '../../../../../common/cases/attachments/entity/test_ids';
import { useCanAttachToCase } from '../../hooks/use_can_attach_to_case';

/**
 * Builds the "add to case" menu items for an entity's flyout "Take action" popover.
 *
 * Centralizes the feature gating (entity attachments + cases attachments) and the
 * case action rendering so each entity footer only has to supply the {@link EntityToAttach}
 * payload. Returns a render function compatible with
 * `TakeAction`'s `additionalItems`, or an empty list when attachments are unavailable.
 *
 * @param entity the entity to attach to a case (memoize at the call site to keep the
 * returned callback stable)
 */
export const useEntityCaseTakeActionItems = (
  entity: EntityToAttach
): ((closePopover: () => void) => React.ReactElement[]) => {
  const entityAttachmentsEnabled = useIsExperimentalFeatureEnabled('entityAttachmentsEnabled');
  const { cases } = useKibana().services;
  const attachmentsEnabled = cases.config.attachmentsEnabled;
  const canAddToCase = useCanAttachToCase();

  return useCallback(
    (closePopover: () => void) => {
      if (
        !entityAttachmentsEnabled ||
        !attachmentsEnabled ||
        !entity.name ||
        !entity.id ||
        !canAddToCase
      ) {
        return [];
      }

      return [
        <AddToCase
          key="addToCase"
          entity={entity}
          onClick={closePopover}
          data-test-subj={ADD_TO_CASE_TEST_ID}
        />,
      ];
    },
    [entityAttachmentsEnabled, attachmentsEnabled, entity, canAddToCase]
  );
};
