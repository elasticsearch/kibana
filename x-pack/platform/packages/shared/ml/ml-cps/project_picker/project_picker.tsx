/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import type { ProjectRouting } from '@kbn/es-query';
import { ProjectPicker, DisabledProjectPicker, type UseFetchProjectsResult } from '@kbn/cps-utils';
import { css } from '@emotion/react';

export interface MlProjectPickerPanelProps {
  projectRouting?: ProjectRouting;
  onProjectRoutingChange: (projectRouting: ProjectRouting) => void;
  projects?: UseFetchProjectsResult;
  totalProjectCount: number;
  isReadonly?: boolean;
  disabled?: boolean;
  displayDisabledTooltip?: boolean;
  projectRoutingValueTestSubj?: string;
}

export const MlProjectPickerPanel: FC<MlProjectPickerPanelProps> = ({
  projectRouting,
  onProjectRoutingChange,
  projects,
  totalProjectCount,
  isReadonly = false,
  disabled = false,
  displayDisabledTooltip = true,
  projectRoutingValueTestSubj,
}) => {
  const isDisabled = disabled || projects === undefined;

  return (
    <EuiPanel
      hasShadow={false}
      hasBorder={true}
      grow={false}
      paddingSize="xs"
      css={{ display: 'inline-block', paddingRight: '12px' }}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          {isDisabled ? (
            <DisabledProjectPicker
              totalProjectCount={totalProjectCount}
              displayTooltip={displayDisabledTooltip}
            />
          ) : (
            <ProjectPicker
              projectRouting={projectRouting}
              onProjectRoutingChange={onProjectRoutingChange}
              projects={projects}
              totalProjectCount={totalProjectCount}
              isReadonly={isReadonly}
            />
          )}
        </EuiFlexItem>
        {projectRouting ? (
          <EuiFlexItem grow={false}>
            <EuiText
              size="s"
              color="subdued"
              data-test-subj={projectRoutingValueTestSubj}
              css={css`
                word-break: break-word;
              `}
            >
              {projectRouting}
            </EuiText>
          </EuiFlexItem>
        ) : null}
      </EuiFlexGroup>
    </EuiPanel>
  );
};
