/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { css } from '@emotion/react';
import {
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  type EuiComboBoxOptionOption,
} from '@elastic/eui';
import {
  UserAvatar,
  getUserDisplayName,
  type UserProfileWithAvatar,
} from '@kbn/user-profile-components';
import { useDebouncedValue } from '@kbn/react-hooks';
import { useSuggestUsers } from '../../../hooks/use_suggest_users';
import { accessFlyoutAddPeoplePlaceholder } from './access_i18n';

interface UserPickerProps {
  /** Profile uids already added to the ACL (excluded from the dropdown). */
  excludedUids: string[];
  /** Usernames of legacy name-only entries already in the ACL (excluded from the dropdown). */
  excludedUsernames?: string[];
  onAdd: (profile: UserProfileWithAvatar) => void;
  isDisabled?: boolean;
}

const EMPTY_USERNAMES: string[] = [];

interface UserOption extends EuiComboBoxOptionOption<string> {
  profile: UserProfileWithAvatar;
}

const SEARCH_DEBOUNCE_MS = 200;
const USER_SEARCH_OPTION_ROW_HEIGHT = 48;

/**
 * `EuiComboBox` reserves a selection indicator column on every option while `singleSelection` is
 * set, and renders it as an invisible `EuiIcon type="empty"` because an option is never kept
 * selected here. Neither the column nor its flex gap is exposed as a prop, so the placeholder is
 * hidden from the options panel to keep the user rows left aligned.
 */
const hiddenOptionIndicatorCss = css`
  .euiListItemLayout__icon {
    display: none;
  }
`;

const profileToOption = (profile: UserProfileWithAvatar): UserOption => ({
  label: getUserDisplayName(profile.user),
  value: profile.uid,
  key: profile.uid,
  profile,
});

export const UserPicker: React.FC<UserPickerProps> = ({
  excludedUids,
  excludedUsernames = EMPTY_USERNAMES,
  onAdd,
  isDisabled,
}) => {
  const [searchValue, setSearchValue] = useState('');
  const debouncedSearch = useDebouncedValue(searchValue, SEARCH_DEBOUNCE_MS);

  const { data: profiles, isFetching } = useSuggestUsers(debouncedSearch);
  const excludedUidSet = useMemo(() => new Set(excludedUids), [excludedUids]);
  const excludedUsernameSet = useMemo(() => new Set(excludedUsernames), [excludedUsernames]);

  const options = useMemo<UserOption[]>(
    () =>
      (profiles ?? [])
        .filter((p) => !excludedUidSet.has(p.uid) && !excludedUsernameSet.has(p.user.username))
        .map(profileToOption),
    [profiles, excludedUidSet, excludedUsernameSet]
  );

  const onChange = useCallback(
    (selected: Array<EuiComboBoxOptionOption<string>>) => {
      const selectedUid = selected[0]?.value;
      if (!selectedUid) return;
      const selectedProfile = (selected[0] as UserOption | undefined)?.profile;
      if (selectedProfile) {
        onAdd(selectedProfile);
        setSearchValue('');
      }
    },
    [onAdd]
  );

  const renderOption = useCallback((option: EuiComboBoxOptionOption<string>) => {
    const { profile } = option as UserOption;
    const displayName = getUserDisplayName(profile.user);
    const secondary = profile.user.email ?? profile.user.username;
    const showSecondary = secondary && secondary !== displayName;
    return (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <UserAvatar user={profile.user} avatar={profile.data?.avatar} size="s" />
        </EuiFlexItem>
        <EuiFlexItem grow>
          <EuiText size="s">{displayName}</EuiText>
          {showSecondary ? (
            <EuiText size="xs" color="subdued">
              {secondary}
            </EuiText>
          ) : null}
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }, []);

  return (
    <div
      css={css`
        position: relative;
      `}
    >
      <EuiComboBox<string>
        aria-label={accessFlyoutAddPeoplePlaceholder}
        placeholder={accessFlyoutAddPeoplePlaceholder}
        prepend="Add"
        options={options}
        selectedOptions={[]}
        onChange={onChange}
        onSearchChange={setSearchValue}
        singleSelection={{ asPlainText: true }}
        inputPopoverProps={{
          panelProps: { css: hiddenOptionIndicatorCss },
        }}
        isLoading={isFetching}
        isDisabled={isDisabled}
        isClearable={false}
        compressed
        renderOption={renderOption}
        rowHeight={USER_SEARCH_OPTION_ROW_HEIGHT}
        async
        data-test-subj="agentBuilderAclUserPicker"
      />
    </div>
  );
};
