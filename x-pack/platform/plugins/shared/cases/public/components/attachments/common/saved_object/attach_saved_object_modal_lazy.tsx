/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { EuiLoadingSpinner, EuiModal, EuiModalBody } from '@elastic/eui';
import type { AttachSavedObjectModalProps } from './attach_saved_object_modal';
import * as i18n from './translations';

const AttachSavedObjectModalInner = React.lazy(async () => {
  const { AttachSavedObjectModal } = await import('./attach_saved_object_modal');
  return { default: AttachSavedObjectModal };
});

/**
 * Lazy entry point for the attach-saved-object modal. Owns the Suspense
 * boundary and renders a modal-shaped loading state while the chunk loads so
 * callers can just render `<AttachSavedObjectModalLazy ... />` without
 * having to know about the lazy boundary.
 */
export const AttachSavedObjectModalLazy: React.FC<AttachSavedObjectModalProps> = (props) => (
  <Suspense
    fallback={
      <EuiModal
        onClose={props.onClose}
        aria-label={i18n.MODAL_TITLE}
        data-test-subj="cases-attach-so-modal-loading"
      >
        <EuiModalBody>
          <EuiLoadingSpinner size="l" />
        </EuiModalBody>
      </EuiModal>
    }
  >
    <AttachSavedObjectModalInner {...props} />
  </Suspense>
);

AttachSavedObjectModalLazy.displayName = 'AttachSavedObjectModalLazy';
