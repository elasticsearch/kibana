/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiLink } from '@elastic/eui';

export interface SavedObjectLinkProps {
  title: string;
  /** Resolved in-app href; when undefined the link renders disabled. */
  href?: string;
  /** Optional anchor target — set to `_blank` from contexts that should not navigate away (e.g. modals). */
  target?: '_blank';
  'data-test-subj'?: string;
}

/**
 * Title rendered as a link to the SO's in-app URL, or as a disabled link when
 * the URL can't be resolved
 */
const SavedObjectLinkComponent: React.FC<SavedObjectLinkProps> = ({
  title,
  href,
  target,
  'data-test-subj': dataTestSubj,
}) =>
  href ? (
    <EuiLink href={href} target={target} data-test-subj={dataTestSubj}>
      {title}
    </EuiLink>
  ) : (
    // EuiLink only accepts `disabled` on its button variant (no href). Render
    // as a disabled link-styled button so the row signals "this would be a
    // link" without making the title look like plain text.
    <EuiLink disabled data-test-subj={dataTestSubj}>
      {title}
    </EuiLink>
  );

SavedObjectLinkComponent.displayName = 'SavedObjectLink';

export const SavedObjectLink = React.memo(SavedObjectLinkComponent);
