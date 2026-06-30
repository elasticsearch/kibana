/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiModal,
  EuiModalBody,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTextColor,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { RequestCodeBlock, type ShowRequestActivePage } from './request_code_block';

const TITLE_CREATE = i18n.translate('xpack.alertingV2.ruleForm.showRequest.titleCreate', {
  defaultMessage: 'Create alerting rule request',
});

const TITLE_UPDATE = i18n.translate('xpack.alertingV2.ruleForm.showRequest.titleUpdate', {
  defaultMessage: 'Update alerting rule request',
});

const SUBTITLE_CREATE = i18n.translate('xpack.alertingV2.ruleForm.showRequest.subtitleCreate', {
  defaultMessage: 'This Kibana request will create this rule.',
});

const SUBTITLE_UPDATE = i18n.translate('xpack.alertingV2.ruleForm.showRequest.subtitleUpdate', {
  defaultMessage: 'This Kibana request will update this rule.',
});

const TAB_CREATE = i18n.translate('xpack.alertingV2.ruleForm.showRequest.tabCreate', {
  defaultMessage: 'Create',
});

const TAB_UPDATE = i18n.translate('xpack.alertingV2.ruleForm.showRequest.tabUpdate', {
  defaultMessage: 'Update',
});

interface ShowRequestModalProps {
  ruleId?: string;
  onClose: () => void;
}

export const ShowRequestModal = ({ ruleId, onClose }: ShowRequestModalProps) => {
  const [activeTab, setActiveTab] = useState<ShowRequestActivePage>(ruleId ? 'update' : 'create');

  const title = activeTab === 'update' ? TITLE_UPDATE : TITLE_CREATE;
  const subtitle = activeTab === 'update' ? SUBTITLE_UPDATE : SUBTITLE_CREATE;

  return (
    <EuiModal
      data-test-subj="ruleV2ShowRequestModal"
      aria-labelledby="showRequestModal"
      onClose={onClose}
    >
      <EuiModalHeader>
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiModalHeaderTitle id="showRequestModal" data-test-subj="showRequestModalTitle">
              {title}
            </EuiModalHeaderTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText data-test-subj="showRequestModalSubtitle">
              <p>
                <EuiTextColor color="subdued">{subtitle}</EuiTextColor>
              </p>
            </EuiText>
          </EuiFlexItem>
          {ruleId && (
            <EuiTabs>
              <EuiTab
                isSelected={activeTab === 'create'}
                onClick={() => setActiveTab('create')}
                data-test-subj="showRequestCreateTab"
              >
                {TAB_CREATE}
              </EuiTab>
              <EuiTab
                isSelected={activeTab === 'update'}
                onClick={() => setActiveTab('update')}
                data-test-subj="showRequestUpdateTab"
              >
                {TAB_UPDATE}
              </EuiTab>
            </EuiTabs>
          )}
        </EuiFlexGroup>
      </EuiModalHeader>
      <EuiModalBody>
        <RequestCodeBlock
          activeTab={activeTab}
          ruleId={ruleId}
          data-test-subj="showRequestModalCodeBlock"
        />
      </EuiModalBody>
    </EuiModal>
  );
};
