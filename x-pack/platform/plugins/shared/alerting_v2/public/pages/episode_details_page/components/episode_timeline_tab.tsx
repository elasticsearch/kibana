/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiPanel, logicalCSS, useEuiMaxBreakpoint, useEuiMinBreakpoint } from '@elastic/eui';
import { css } from '@emotion/react';
import { AlertEpisodeTimelineSection } from '@kbn/alerting-v2-episodes-ui/components/details/timeline_section';
import type { AlertEpisodesKibanaServices } from '../../../episodes_kibana_services';

interface EpisodeTimelineTabProps {
  episodeId: string;
  groupHash: string | undefined;
  services: Pick<AlertEpisodesKibanaServices, 'data' | 'spaces' | 'userProfile'>;
}

export const EpisodeTimelineTab = ({ episodeId, groupHash, services }: EpisodeTimelineTabProps) => {
  return (
    <EuiPanel
      hasBorder={false}
      hasShadow={false}
      paddingSize="l"
      css={css`
        ${useEuiMaxBreakpoint('s')} {
          ${logicalCSS('padding-horizontal', '0')}
        }

        ${useEuiMinBreakpoint('m')} {
          height: 100%;
          overflow-y: auto;
          ${logicalCSS('padding-left', '0')}
        }
      `}
    >
      <AlertEpisodeTimelineSection
        episodeId={episodeId}
        groupHash={groupHash}
        services={services}
      />
    </EuiPanel>
  );
};
