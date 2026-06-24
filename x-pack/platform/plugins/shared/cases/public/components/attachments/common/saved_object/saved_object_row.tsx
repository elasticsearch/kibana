/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiBadge, EuiButton, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import { FormattedRelativePreferenceDate } from '../../../formatted_date';
import { SavedObjectLink } from './saved_object_link';
import { TagBadges } from './tag_badges';
import type { FoundSavedObject } from './types';
import * as i18n from './translations';

export interface SavedObjectRowProps {
  savedObject: FoundSavedObject;
  /** Display title; falls back to the SO id when no `meta.title` is set. */
  title: string;
  /** Resolved display name for the SO type, e.g. "Dashboard". */
  typeLabel: string;
  /** Optional in-app href; when absent, the title renders as a disabled link. */
  href: string | undefined;
  /** Whether this SO is already attached to the case. */
  isAttached: boolean;
  /** True while this row's attach request is in flight (drives the spinner). */
  isAttachInFlight: boolean;
  /** True while any attach mutation from `useAttachSavedObject` is running. */
  isAttachingAny: boolean;
  taggingApi: SavedObjectsTaggingApi | undefined;
  onAttach: (savedObject: FoundSavedObject) => void;
}

const SavedObjectRowComponent: React.FC<SavedObjectRowProps> = ({
  savedObject,
  title,
  typeLabel,
  href,
  isAttached,
  isAttachInFlight,
  isAttachingAny,
  taggingApi,
  onAttach,
}) => {
  const handleClick = useCallback(() => onAttach(savedObject), [onAttach, savedObject]);

  return (
    <EuiPanel
      hasBorder
      hasShadow={false}
      paddingSize="m"
      data-test-subj={`cases-attach-so-card-${savedObject.id}`}
    >
      <EuiFlexGroup
        justifyContent="spaceBetween"
        alignItems="flexStart"
        gutterSize="m"
        responsive={false}
      >
        <EuiFlexItem>
          <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
            <EuiFlexItem grow={false}>
              <SavedObjectLink
                title={title}
                href={href}
                target="_blank"
                data-test-subj={`cases-attach-so-link-${savedObject.id}`}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiBadge data-test-subj="cases-attach-so-card-type">{typeLabel}</EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <TagBadges
                    references={savedObject.references}
                    taggingApi={taggingApi}
                    id={savedObject.id}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            {savedObject.updated_at && (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued" data-test-subj="cases-attach-so-card-updated">
                  {`${i18n.UPDATED_AT_PREFIX} `}
                  <FormattedRelativePreferenceDate value={savedObject.updated_at} />
                </EuiText>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            color={isAttached ? 'success' : 'primary'}
            iconType={isAttached ? 'check' : 'plusInCircle'}
            isLoading={isAttachInFlight}
            isDisabled={isAttachingAny || isAttached}
            onClick={handleClick}
            data-test-subj={`cases-attach-so-button-${savedObject.id}`}
          >
            {isAttached ? i18n.ATTACHED_ACTION : i18n.ATTACH_ACTION}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

SavedObjectRowComponent.displayName = 'SavedObjectRow';

export const SavedObjectRow = React.memo(SavedObjectRowComponent);
