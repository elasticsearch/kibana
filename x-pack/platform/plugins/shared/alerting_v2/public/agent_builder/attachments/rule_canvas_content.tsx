/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { EuiPanel, EuiSpacer } from '@elastic/eui';
import {
  ActionButtonType,
  type AttachmentRenderProps,
  type CanvasRenderCallbacks,
} from '@kbn/agent-builder-browser/attachments';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { RuleProvider } from '../../components/rule_details/rule_context';
import { RuleHeaderDescription } from '../../components/rule_details/rule_header_description';
import { RuleSidebar } from '../../components/rule_details/sidebar/rule_sidebar';
import { paths } from '../../constants';
import { RulesApi, type RuleApiResponse } from '../../services/rules_api';
import { buildRulePayload } from '../../../common/agent_builder/rule_mappers';
import type { RuleAttachment } from './rule_attachment_definition';

export interface RuleCanvasContentProps
  extends AttachmentRenderProps<RuleAttachment>,
    CanvasRenderCallbacks {}

export const RuleCanvasContent = ({
  attachment,
  registerActionButtons,
  updateOrigin,
}: RuleCanvasContentProps) => {
  const rulesApi = useService(RulesApi);
  const application = useService(CoreStart('application'));
  const basePath = useService(CoreStart('http')).basePath;
  const notifications = useService(CoreStart('notifications'));

  const { data, origin: savedObjectId } = attachment;
  const isPersisted = isPersistedSavedObject(savedObjectId);

  const [mounted, setMounted] = React.useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      registerActionButtons([]);
      return;
    }

    if (!isPersisted) {
      registerActionButtons([
        {
          label: i18n.translate('xpack.alertingV2.ruleAttachment.createRule', {
            defaultMessage: 'Create rule',
          }),
          icon: 'save',
          type: ActionButtonType.PRIMARY,
          handler: async () => {
            await rulesApi.upsertRule(data.id!, buildRulePayload(data));
            await updateOrigin(data.id!);
            notifications.toasts.addSuccess(
              i18n.translate('xpack.alertingV2.ruleAttachment.createdSuccess', {
                defaultMessage: 'Rule "{name}" created',
                values: { name: data.metadata.name },
              })
            );
          },
        },
      ]);
      return;
    }

    const ruleId = savedObjectId;

    registerActionButtons([
      {
        label: i18n.translate('xpack.alertingV2.ruleAttachment.updateRule', {
          defaultMessage: 'Update Rule',
        }),
        icon: 'save',
        type: ActionButtonType.PRIMARY,
        handler: async () => {
          await rulesApi.upsertRule(ruleId, buildRulePayload(data));
          notifications.toasts.addSuccess(
            i18n.translate('xpack.alertingV2.ruleAttachment.updatedSuccess', {
              defaultMessage: 'Rule "{name}" updated',
              values: { name: data.metadata.name },
            })
          );
        },
      },
      {
        label: i18n.translate('xpack.alertingV2.ruleAttachment.viewInRules', {
          defaultMessage: 'View in Rules',
        }),
        icon: 'popout',
        type: ActionButtonType.OVERFLOW,
        handler: () => {
          application.navigateToUrl(basePath.prepend(paths.ruleDetails(ruleId)));
        },
      },
    ]);
  }, [
    mounted,
    isPersisted,
    savedObjectId,
    registerActionButtons,
    updateOrigin,
    rulesApi,
    application,
    basePath,
    notifications,
    data,
  ]);

  return (
    <RuleProvider rule={data as unknown as RuleApiResponse}>
      <EuiPanel paddingSize="l" hasShadow={false}>
        <RuleHeaderDescription />
        <EuiSpacer size="m" />
        <RuleSidebar showQueryPreview />
      </EuiPanel>
    </RuleProvider>
  );
};

const isPersistedSavedObject = (savedObjectId: string | undefined): savedObjectId is string => {
  return Boolean(savedObjectId);
};
