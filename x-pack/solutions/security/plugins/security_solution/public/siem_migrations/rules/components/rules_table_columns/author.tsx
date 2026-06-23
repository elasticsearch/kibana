/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiHorizontalRule, EuiIcon, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { SiemMigrationStatus } from '../../../../../common/siem_migrations/constants';
import { type RuleMigrationRule } from '../../../../../common/siem_migrations/model/rule_migration.gen';
import * as i18n from './translations';
import { COLUMN_EMPTY_VALUE, type TableColumn } from './constants';
import { TableHeader } from '../../../common/components';

const Author = ({ isPrebuiltRule }: { isPrebuiltRule: boolean }) => {
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      {isPrebuiltRule && (
        <EuiFlexItem grow={false}>
          <EuiIcon type="logoElastic" size="m" aria-hidden={true} />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        {isPrebuiltRule ? i18n.ELASTIC_AUTHOR_TITLE : i18n.CUSTOM_AUTHOR_TITLE}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const createAuthorColumn = (): TableColumn => {
  return {
    field: 'elastic_rule.prebuilt_rule_id',
    name: (
      <TableHeader
        title={i18n.COLUMN_AUTHOR}
        tooltipContent={
          <FormattedMessage
            id="xpack.securitySolution.siemMigrations.rules.tableColumn.authorTooltip"
            defaultMessage="{title}
            {elastic} authored rules have been created and are maintained by Elastic. {lineBreak}
            {custom} rules are any rules that are not authored by Elastic and will not be maintained or updated automatically."
            values={{
              lineBreak: <br />,
              title: (
                <EuiText size="s">
                  <p>
                    <b>{i18n.COLUMN_AUTHOR}</b>
                    <EuiHorizontalRule margin="s" />
                  </p>
                </EuiText>
              ),
              elastic: <b>{i18n.ELASTIC_AUTHOR_TITLE}</b>,
              custom: <b>{i18n.CUSTOM_AUTHOR_TITLE}</b>,
            }}
          />
        }
      />
    ),
    render: (_, rule: RuleMigrationRule) => {
      return rule.status === SiemMigrationStatus.FAILED ? (
        <>{COLUMN_EMPTY_VALUE}</>
      ) : (
        <Author isPrebuiltRule={!!rule.elastic_rule?.prebuilt_rule_id} />
      );
    },
    sortable: true,
    truncateText: true,
    width: '10%',
  };
};
