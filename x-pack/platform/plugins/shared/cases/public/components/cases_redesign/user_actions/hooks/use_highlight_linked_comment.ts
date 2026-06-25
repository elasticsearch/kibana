/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useState } from 'react';

import { useCaseViewParams } from '../../../../common/navigation';

/**
 * Highlights a comment when navigating to a deep-link URL containing a commentId.
 * Fires once on initial load to outline the linked comment.
 */
export const useHighlightLinkedComment = (handleOutlineComment: (id: string) => void) => {
  const { commentId } = useCaseViewParams();
  const [hasHighlighted, setHasHighlighted] = useState(false);

  useEffect(() => {
    if (commentId != null && !hasHighlighted) {
      setHasHighlighted(true);
      handleOutlineComment(commentId);
    }
  }, [commentId, hasHighlighted, handleOutlineComment]);
};
