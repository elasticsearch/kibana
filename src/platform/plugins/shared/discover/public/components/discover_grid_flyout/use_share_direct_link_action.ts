/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import type { EuiFlyoutMenuAction } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { getEbtProps } from '@kbn/ebt-click';
import {
  ExpandedDocLinkability,
  getExpandedDocLinkDisabledReason,
} from '../../application/main/utils/expanded_doc';
import { useDiscoverServices } from '../../hooks/use_discover_services';

const expandedDocLinkabilityEbtDetails: Record<ExpandedDocLinkability, string> = {
  [ExpandedDocLinkability.Linkable]: 'linkable',
  [ExpandedDocLinkability.EsqlUnsupportedSource]: 'esqlUnsupportedSource',
  [ExpandedDocLinkability.EsqlMissingMetadata]: 'esqlMissingMetadata',
  [ExpandedDocLinkability.EsqlTransformational]: 'esqlTransformational',
};

/**
 * Builds the doc viewer flyout header "Share direct link" action shared by the Discover app and the
 * saved search embeddable. When the current document is not linkable the action stays enabled but
 * explains why via a warning toast instead of copying.
 */
export const useShareDirectLinkAction = ({
  copyLink,
  linkability,
}: {
  copyLink: () => Promise<void>;
  linkability: ExpandedDocLinkability;
}): EuiFlyoutMenuAction[] => {
  const { toastNotifications } = useDiscoverServices();

  return useMemo(() => {
    const disabledReason = getExpandedDocLinkDisabledReason(linkability);
    const copyLinkLabel = i18n.translate('discover.docViews.flyout.copyLinkLabel', {
      defaultMessage: 'Share direct link',
    });

    return [
      {
        iconType: 'share',
        'aria-label': disabledReason
          ? i18n.translate('discover.docViews.flyout.copyLinkUnavailableAriaLabel', {
              defaultMessage: 'Cannot share direct link: {reason}',
              values: { reason: disabledReason },
            })
          : copyLinkLabel,
        toolTipContent: disabledReason ?? copyLinkLabel,
        toolTipProps: {
          anchorProps: {
            'data-test-subj': 'discoverDocFlyoutShareDirectLink',
            ...getEbtProps({
              action: 'shareDirectLink',
              element: 'docViewerFlyoutHeader',
              detail: expandedDocLinkabilityEbtDetails[linkability],
            }),
          },
        },
        onClick: () => {
          if (disabledReason) {
            toastNotifications.addWarning({
              title: i18n.translate('discover.docViews.flyout.copyLinkUnavailableTitle', {
                defaultMessage: 'Cannot share direct link',
              }),
              text: disabledReason,
              'data-test-subj': 'discoverDocFlyoutCopyLinkWarning',
            });
          } else {
            void copyLink();
          }
        },
      },
    ];
  }, [copyLink, linkability, toastNotifications]);
};
