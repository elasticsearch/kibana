/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  EuiTitle,
} from '@elastic/eui';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { KbnDangerCallout } from '@kbn/ui-callout';
import { playlistClient } from '../dashboard_client';
import type { DashboardPlaylist, DashboardPlaylistRequest } from '../../common/playlist';
import { DEFAULT_PLAYLIST_DURATION } from '../../common/playlist';
import { dashboardClient } from '../dashboard_client';
import { findService } from '../dashboard_client';
import { coreServices } from '../services/kibana_services';
import { getDashboardCapabilities } from '../utils/get_dashboard_capabilities';
import { playlistStrings } from './_playlist_strings';

const emptyRequest: DashboardPlaylistRequest = {
  name: '',
  dashboardIds: [],
  duration: DEFAULT_PLAYLIST_DURATION,
};

export const PlaylistListing = () => {
  const [playlists, setPlaylists] = useState<DashboardPlaylist[]>([]);
  const [editing, setEditing] = useState<DashboardPlaylistRequest & { id?: string }>();
  const [dashboardTitles, setDashboardTitles] = useState<Record<string, string>>({});
  const [dashboardOptions, setDashboardOptions] = useState<Array<EuiComboBoxOptionOption<string>>>(
    []
  );
  const [isDashboardSearchLoading, setIsDashboardSearchLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>();
  const searchRequestId = useRef(0);
  const isEditing = editing !== undefined;
  const { showWriteControls } = getDashboardCapabilities();

  const refresh = useCallback(async () => {
    try {
      setPlaylists(await playlistClient.find());
    } catch (refreshError) {
      setError(
        refreshError instanceof Error ? refreshError.message : playlistStrings.loadErrorMessage
      );
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const searchDashboards = useCallback(async (query: string) => {
    const requestId = ++searchRequestId.current;
    setIsDashboardSearchLoading(true);
    try {
      const response = await dashboardClient.search({ query, per_page: 20 });
      if (requestId !== searchRequestId.current) return;
      setDashboardOptions(
        response.data.map(({ id, data }) => ({
          value: id,
          label: data.title,
        }))
      );
    } catch (searchError) {
      if (requestId === searchRequestId.current) {
        setError(
          searchError instanceof Error ? searchError.message : playlistStrings.searchErrorMessage
        );
      }
    } finally {
      if (requestId === searchRequestId.current) setIsDashboardSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isEditing) void searchDashboards('');
  }, [isEditing, searchDashboards]);

  const save = async () => {
    if (!editing?.name.trim() || editing.dashboardIds.length === 0 || editing.duration <= 0) return;
    setIsSaving(true);
    setError(undefined);
    const request: DashboardPlaylistRequest = {
      name: editing.name,
      dashboardIds: editing.dashboardIds,
      duration: editing.duration,
    };
    try {
      if (editing.id) await playlistClient.update(editing.id, request);
      else await playlistClient.create(request);
      setEditing(undefined);
      await refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : playlistStrings.saveErrorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const editPlaylist = async (playlist: DashboardPlaylist) => {
    setEditing(playlist);
    const results = await findService.findByIds(playlist.dashboardIds);
    setDashboardTitles((titles) => ({
      ...titles,
      ...results.reduce<Record<string, string>>((nextTitles, result) => {
        if (result.status === 'success') nextTitles[result.id] = result.attributes.title;
        return nextTitles;
      }, {}),
    }));
  };

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      <EuiFlexItem>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="m">
              <h2>{playlistStrings.pageTitle}</h2>
            </EuiTitle>
          </EuiFlexItem>
          {showWriteControls && (
            <EuiFlexItem grow={false}>
              <EuiButton iconType="plusCircle" onClick={() => setEditing(emptyRequest)}>
                {playlistStrings.createButtonLabel}
              </EuiButton>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiFlexItem>
      {error && (
        <EuiFlexItem>
          <KbnDangerCallout announceOnMount title={playlistStrings.errorTitle}>
            {error}
          </KbnDangerCallout>
        </EuiFlexItem>
      )}
      {editing && (
        <EuiFlexItem>
          <EuiPanel hasBorder>
            <EuiTitle size="s">
              <h3>{playlistStrings.editTitle(Boolean(editing.id))}</h3>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiForm
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <EuiFormRow label="Name" fullWidth>
                <EuiFieldText
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                />
              </EuiFormRow>
              <EuiFormRow
                label={playlistStrings.durationLabel}
                helpText={playlistStrings.durationHelpText}
                fullWidth
              >
                <EuiFieldNumber
                  min={1}
                  value={editing.duration / 1000}
                  onChange={(event) =>
                    setEditing({ ...editing, duration: Number(event.target.value) * 1000 })
                  }
                />
              </EuiFormRow>
              <EuiFormRow
                label={playlistStrings.findDashboardsLabel}
                helpText={playlistStrings.findDashboardsHelpText}
                fullWidth
              >
                <EuiComboBox<string>
                  aria-label={playlistStrings.findDashboardsLabel}
                  fullWidth
                  isClearable
                  isLoading={isDashboardSearchLoading}
                  placeholder={playlistStrings.findDashboardsPlaceholder}
                  options={dashboardOptions.filter(
                    (option) => !editing.dashboardIds.includes(option.value ?? '')
                  )}
                  selectedOptions={editing.dashboardIds.map((id) => ({
                    value: id,
                    label: dashboardTitles[id] ?? id,
                  }))}
                  onSearchChange={(query) => void searchDashboards(query)}
                  onChange={(options) => {
                    const dashboardIds = options.flatMap((option) =>
                      option.value ? [option.value] : []
                    );
                    setDashboardTitles({
                      ...dashboardTitles,
                      ...options.reduce<Record<string, string>>((titles, option) => {
                        if (option.value) titles[option.value] = option.label;
                        return titles;
                      }, {}),
                    });
                    setEditing({ ...editing, dashboardIds });
                  }}
                />
              </EuiFormRow>
              <EuiFormRow
                label={playlistStrings.orderLabel}
                helpText={playlistStrings.orderHelpText}
                fullWidth
              >
                <EuiPanel color="subdued" paddingSize="s">
                  {editing.dashboardIds.length > 0 ? (
                    <EuiText size="s">
                      <ol>
                        {editing.dashboardIds.map((id, index) => (
                          <li key={id}>
                            {dashboardTitles[id] ?? id}{' '}
                            <EuiToolTip
                              content={playlistStrings.moveUpTooltip}
                              disableScreenReaderOutput
                            >
                              <EuiButtonIcon
                                iconType="sortUp"
                                aria-label={playlistStrings.moveUpAriaLabel}
                                disabled={index === 0}
                                onClick={() =>
                                  setEditing({
                                    ...editing,
                                    dashboardIds: move(editing.dashboardIds, index, -1),
                                  })
                                }
                              />
                            </EuiToolTip>
                            <EuiToolTip
                              content={playlistStrings.moveDownTooltip}
                              disableScreenReaderOutput
                            >
                              <EuiButtonIcon
                                iconType="sortDown"
                                aria-label={playlistStrings.moveDownAriaLabel}
                                disabled={index === editing.dashboardIds.length - 1}
                                onClick={() =>
                                  setEditing({
                                    ...editing,
                                    dashboardIds: move(editing.dashboardIds, index, 1),
                                  })
                                }
                              />
                            </EuiToolTip>
                            <EuiToolTip
                              content={playlistStrings.removeTooltip}
                              disableScreenReaderOutput
                            >
                              <EuiButtonIcon
                                iconType="cross"
                                aria-label={playlistStrings.removeAriaLabel}
                                onClick={() =>
                                  setEditing({
                                    ...editing,
                                    dashboardIds: editing.dashboardIds.filter(
                                      (dashboardId) => dashboardId !== id
                                    ),
                                  })
                                }
                              />
                            </EuiToolTip>
                          </li>
                        ))}
                      </ol>
                    </EuiText>
                  ) : (
                    <EuiText color="subdued" size="s">
                      {playlistStrings.emptyOrderDescription}
                    </EuiText>
                  )}
                </EuiPanel>
              </EuiFormRow>
              <EuiSpacer size="m" />
              <EuiButton
                fill
                iconType="save"
                type="submit"
                isLoading={isSaving}
                disabled={
                  isSaving ||
                  !editing.name.trim() ||
                  editing.dashboardIds.length === 0 ||
                  editing.duration <= 0
                }
              >
                {playlistStrings.saveButtonLabel}
              </EuiButton>{' '}
              <EuiButton onClick={() => setEditing(undefined)}>
                {playlistStrings.cancelButtonLabel}
              </EuiButton>
            </EuiForm>
          </EuiPanel>
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        {playlists.length === 0 && !editing && <EuiText>{playlistStrings.emptyState}</EuiText>}
        {playlists.map((playlist) => (
          <React.Fragment key={playlist.id}>
            <EuiFlexGroup alignItems="center">
              <EuiFlexItem>
                <EuiText>
                  <strong>{playlist.name}</strong>{' '}
                  {playlistStrings.dashboardCount(playlist.dashboardIds.length)}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  size="s"
                  onClick={() =>
                    coreServices.application.navigateToApp('dashboards', {
                      path: `#/playlist/${playlist.id}`,
                    })
                  }
                >
                  {playlistStrings.startButtonLabel}
                </EuiButton>
              </EuiFlexItem>
              {showWriteControls && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={playlistStrings.editAriaLabel(playlist.name)}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      iconType="pencil"
                      aria-label={playlistStrings.editAriaLabel(playlist.name)}
                      onClick={() => void editPlaylist(playlist)}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
              {showWriteControls && (
                <EuiFlexItem grow={false}>
                  <EuiToolTip
                    content={playlistStrings.deleteAriaLabel(playlist.name)}
                    disableScreenReaderOutput
                  >
                    <EuiButtonIcon
                      iconType="trash"
                      aria-label={playlistStrings.deleteAriaLabel(playlist.name)}
                      color="danger"
                      onClick={() =>
                        void playlistClient
                          .delete(playlist.id)
                          .then(refresh)
                          .catch((deleteError) => {
                            setError(
                              deleteError instanceof Error
                                ? deleteError.message
                                : playlistStrings.deleteErrorMessage
                            );
                          })
                      }
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
            <EuiHorizontalRule margin="s" />
          </React.Fragment>
        ))}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const move = (items: string[], index: number, direction: -1 | 1) => {
  const next = [...items];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
};
