/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiHorizontalRule,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { labels } from '../../../utils/i18n';
import { usePlugin } from '../../../hooks/plugins/use_plugin';
import { useSkill } from '../../../hooks/skills/use_skills';
import { DetailPanelLayout } from '../common/detail_panel_layout';
import { RenderMarkdownReadOnly } from '../common/render_markdown_read_only';

interface PluginDetailPanelProps {
  pluginId: string;
  onRemove: () => void;
  isAuto?: boolean;
}

export const PluginDetailPanel: React.FC<PluginDetailPanelProps> = ({
  pluginId,
  onRemove,
  isAuto = false,
}) => {
  const { euiTheme } = useEuiTheme();
  const { plugin, isLoading } = usePlugin({ pluginId });
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const isReadOnly = plugin?.readonly;

  return (
    <>
      <DetailPanelLayout
        isLoading={isLoading}
        isEmpty={!plugin}
        title={plugin?.name ?? pluginId}
        isReadOnly={isReadOnly}
        headerContent={
          <>
            <div
              css={css`
                margin-top: ${euiTheme.size.xs};
              `}
            >
              <EuiBadge color="hollow" iconType="bolt">
                {labels.agentPlugins.skillsCountBadge(plugin?.skill_ids.length ?? 0)}
              </EuiBadge>
            </div>
            <EuiText
              size="s"
              color="subdued"
              css={css`
                margin-top: ${euiTheme.size.s};
              `}
            >
              {plugin?.description || '\u2014'}
            </EuiText>
          </>
        }
        headerActions={(openConfirmRemove) =>
          isAuto ? (
            <EuiBadge color="hollow">{labels.agentPlugins.autoIncludedBadgeLabel}</EuiBadge>
          ) : (
            <EuiButtonEmpty
              iconType="cross"
              size="xs"
              color="danger"
              onClick={openConfirmRemove}
              {...getEbtProps({
                element: AGENT_BUILDER_UI_EBT.element.pageContent,
                action: AGENT_BUILDER_UI_EBT.action.agentCustomization.ENTITY_REMOVE,
                detail: AGENT_BUILDER_UI_EBT.entity.PLUGIN,
              })}
            >
              {labels.agentPlugins.removePluginButtonLabel}
            </EuiButtonEmpty>
          )
        }
        confirmRemove={{
          title: labels.agentPlugins.removePluginConfirmTitle(plugin?.name ?? pluginId),
          body: labels.agentPlugins.removePluginConfirmBody,
          confirmButtonText: labels.agentPlugins.removePluginConfirmButton,
          cancelButtonText: labels.agentPlugins.removePluginCancelButton,
          onConfirm: onRemove,
        }}
        footer={plugin && <PluginIdFooter pluginId={plugin.id} />}
      >
        <EuiFlexGroup direction="column" gutterSize="none">
          <EuiTitle size="xs">
            <h4>{labels.agentPlugins.pluginDetailSourceLabel}</h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiFlexItem>
            {plugin?.source_url ? (
              <EuiLink href={plugin.source_url} target="_blank" external>
                {plugin.source_url}
              </EuiLink>
            ) : (
              <EuiText size="s" color="subdued">
                {'\u2014'}
              </EuiText>
            )}
          </EuiFlexItem>
          <EuiHorizontalRule margin="l" />
          <EuiTitle size="xs">
            <h4>{labels.agentPlugins.pluginDetailSkillsLabel}</h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiFlexItem>
            {plugin?.skill_ids && plugin.skill_ids.length > 0 ? (
              <EuiFlexGroup direction="column" gutterSize="xs">
                {plugin.skill_ids.map((skillId) => (
                  <EuiFlexItem key={skillId} grow={false}>
                    <EuiLink onClick={() => setSelectedSkillId(skillId)}>{skillId}</EuiLink>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            ) : (
              <EuiText size="s" color="subdued">
                {labels.plugins.noSkillsLabel}
              </EuiText>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </DetailPanelLayout>

      {selectedSkillId && (
        <SkillDetailFlyout
          skillId={selectedSkillId}
          pluginName={plugin?.name ?? pluginId}
          onClose={() => setSelectedSkillId(null)}
        />
      )}
    </>
  );
};

const PluginIdFooter: React.FC<{ pluginId: string }> = ({ pluginId }) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiFlexGroup
      alignItems="center"
      justifyContent="center"
      gutterSize="s"
      responsive={false}
      css={css`
        padding: ${euiTheme.size.s} ${euiTheme.size.m};
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiText size="xs">
          <strong>{labels.agentPlugins.pluginDetailIdLabel}</strong>
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color="subdued">
          {pluginId}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiCopy textToCopy={pluginId}>
          {(copy) => (
            <EuiToolTip
              content={labels.agentPlugins.pluginDetailIdCopyLabel}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                iconType="copyClipboard"
                onClick={copy}
                aria-label={labels.agentPlugins.pluginDetailIdCopyLabel}
                size="xs"
                css={css`
                  color: ${euiTheme.colors.textSubdued};
                `}
              />
            </EuiToolTip>
          )}
        </EuiCopy>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const SkillDetailFlyout: React.FC<{
  skillId: string;
  pluginName: string;
  onClose: () => void;
}> = ({ skillId, pluginName, onClose }) => {
  const { skill, isLoading } = useSkill({ skillId });

  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby="pluginSkillDetailFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="s">
              <h2 id="pluginSkillDetailFlyoutTitle">{skill?.name ?? skillId}</h2>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow" iconType="lock">
              {labels.agentSkills.readOnlyBadge}
            </EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiText size="xs" color="subdued">
          {labels.agentPlugins.skillDetailInstalledVia(pluginName)}
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {isLoading ? (
          <EuiFlexGroup justifyContent="center" alignItems="center">
            <EuiLoadingSpinner size="l" />
          </EuiFlexGroup>
        ) : skill ? (
          <EuiFlexGroup direction="column" gutterSize="l">
            <EuiFlexItem grow={false}>
              <EuiTitle size="xxxs">
                <h4>{labels.agentPlugins.pluginDetailNameLabel}</h4>
              </EuiTitle>
              <EuiText size="s">{skill.name}</EuiText>
            </EuiFlexItem>
            <EuiHorizontalRule margin="none" />
            <EuiFlexItem grow={false}>
              <EuiTitle size="xxxs">
                <h4>{labels.agentPlugins.pluginDetailIdLabel}</h4>
              </EuiTitle>
              <EuiText size="s">{skill.id}</EuiText>
            </EuiFlexItem>
            <EuiHorizontalRule margin="none" />
            <EuiFlexItem grow={false}>
              <EuiTitle size="xxxs">
                <h4>{labels.agentPlugins.pluginDetailDescriptionLabel}</h4>
              </EuiTitle>
              <EuiText size="s">{skill.description || '\u2014'}</EuiText>
            </EuiFlexItem>
            <EuiHorizontalRule margin="none" />
            <EuiFlexItem grow={false}>
              <RenderMarkdownReadOnly
                label={labels.agentPlugins.pluginDetailInstructionsLabel}
                content={skill.content ?? ''}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        ) : null}
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
