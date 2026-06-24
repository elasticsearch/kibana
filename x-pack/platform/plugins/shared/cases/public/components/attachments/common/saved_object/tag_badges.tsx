/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { EuiBadge, EuiBadgeGroup, EuiToolTip } from '@elastic/eui';
import type { SavedObjectReference } from '@kbn/core-saved-objects-common/src/server_types';
import type { SavedObjectsTaggingApi } from '@kbn/saved-objects-tagging-oss-plugin/public';
import * as i18n from './translations';

type Tag = NonNullable<ReturnType<SavedObjectsTaggingApi['ui']['getTag']>>;

/** Max number of tags shown inline before collapsing the rest into a "+N" badge. */
const MAX_INLINE_TAGS = 4;

export interface TagBadgesProps {
  references: SavedObjectReference[] | undefined;
  taggingApi: SavedObjectsTaggingApi | undefined;
  /** Used to namespace `data-test-subj` attributes so multiple cards don't collide. */
  id: string;
}

const TagBadgesComponent: React.FC<TagBadgesProps> = ({ references, taggingApi, id }) => {
  const tags = useMemo<Tag[]>(() => {
    // The tagging cache loads asynchronously at plugin start and is reliably
    // initialised before the user can reach this modal, so a one-shot
    // `getState()` read is enough — no need to subscribe to live updates.
    if (!taggingApi || !references?.length) {
      return [];
    }
    const tagIds = new Set(taggingApi.ui.getTagIdsFromReferences(references));
    if (tagIds.size === 0) {
      return [];
    }
    return taggingApi.cache.getState().filter((tag) => tagIds.has(tag.id));
  }, [references, taggingApi]);

  if (tags.length === 0) {
    return null;
  }

  const inline = tags.slice(0, MAX_INLINE_TAGS);
  const overflow = tags.slice(MAX_INLINE_TAGS);

  return (
    <EuiBadgeGroup gutterSize="xs" data-test-subj={`cases-attach-so-card-tags-${id}`}>
      {inline.map((tag) => (
        <EuiBadge
          key={tag.id}
          color="hollow"
          data-test-subj={`cases-attach-so-card-tag-${id}-${tag.id}`}
        >
          {tag.name}
        </EuiBadge>
      ))}
      {overflow.length > 0 && (
        <EuiToolTip
          position="top"
          content={overflow.map((tag) => tag.name).join(', ')}
          data-test-subj={`cases-attach-so-card-tags-overflow-${id}`}
        >
          <EuiBadge
            color="hollow"
            tabIndex={0}
            aria-label={i18n.MORE_TAGS_ARIA(overflow.length)}
            data-test-subj={`cases-attach-so-card-tags-more-${id}`}
          >
            {i18n.MORE_TAGS_BADGE(overflow.length)}
          </EuiBadge>
        </EuiToolTip>
      )}
    </EuiBadgeGroup>
  );
};

TagBadgesComponent.displayName = 'TagBadges';

export const TagBadges = React.memo(TagBadgesComponent);
