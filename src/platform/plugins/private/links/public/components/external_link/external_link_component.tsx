/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiListGroupItem } from '@elastic/eui';
import { METRIC_TYPE } from '@kbn/analytics';
import React, { useMemo } from 'react';

import {
  DEFAULT_EXTERNAL_LINK_OPTIONS,
  EXTERNAL_LINK_TYPE,
  LINKS_VERTICAL_LAYOUT,
} from '../../../common/constants';
import type { LinksLayoutType } from '../../../common/types';
import type { ExternalLinkOptions } from '../../../server';
import { coreServices, trackUiMetric } from '../../services/kibana_services';
import type { ResolvedLink } from '../../types';

export const ExternalLinkComponent = ({
  link,
  layout,
}: {
  link: ResolvedLink;
  layout: LinksLayoutType;
}) => {
  const linkOptions = useMemo(() => {
    return {
      ...DEFAULT_EXTERNAL_LINK_OPTIONS,
      ...link.options,
    } as ExternalLinkOptions;
  }, [link.options]);

  const destination = useMemo(() => {
    return link.destination && linkOptions.encode_url
      ? encodeURI(link.destination)
      : link.destination;
  }, [linkOptions, link.destination]);

  const id = `externalLink--${link.id}`;
  const testId = `externalLink--${link.title}`;

  return (
    <EuiListGroupItem
      external
      color="text"
      isDisabled={Boolean(link.error)}
      className={'linksPanelLink'}
      showToolTip={Boolean(link.error)}
      toolTipProps={{
        content: link.error?.message,
        position: layout === LINKS_VERTICAL_LAYOUT ? 'right' : 'bottom',
        repositionOnScroll: true,
        'data-test-subj': `${testId}--tooltip`,
      }}
      iconType={link.error ? 'warning' : undefined}
      id={id}
      label={link.label || link.destination}
      data-test-subj={link.error ? `${testId}--error` : `${testId}`}
      href={destination}
      onClick={async (event) => {
        if (!destination) return;

        trackUiMetric?.(METRIC_TYPE.CLICK, `${EXTERNAL_LINK_TYPE}:click`);

        /** Only use `navigateToUrl` if we **aren't** opening in a new window/tab; otherwise, just use default href handling */
        const modifiedClick = event.ctrlKey || event.metaKey || event.shiftKey;
        if (!modifiedClick) {
          event.preventDefault();
          if (linkOptions.open_in_new_tab) {
            window.open(destination, '_blank');
          } else {
            await coreServices.application.navigateToUrl(destination);
          }
        }
      }}
    />
  );
};
