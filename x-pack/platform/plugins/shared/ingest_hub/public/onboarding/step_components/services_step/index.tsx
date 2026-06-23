/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFieldSearch,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  euiPaletteColorBlind,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { ServiceRow } from './service_row';
import { SIGNAL_TYPE_LABELS } from './signal_type_badge';
import { useServicesStep, CATEGORY_ORDER } from './use_services_step';
import type { SignalFilter } from './use_services_step';

interface ServicesStepProps {
  onNext: () => void;
  onBack?: () => void;
}

const SIGNAL_FILTER_OPTIONS = [
  {
    id: 'all' as SignalFilter,
    label: i18n.translate('xpack.ingestHub.servicesStep.filter.all', { defaultMessage: 'All' }),
  },
  {
    id: 'logs' as SignalFilter,
    label: i18n.translate('xpack.ingestHub.servicesStep.filter.logs', { defaultMessage: 'Logs' }),
  },
  {
    id: 'metrics' as SignalFilter,
    label: i18n.translate('xpack.ingestHub.servicesStep.filter.metrics', {
      defaultMessage: 'Metrics',
    }),
  },
];

const CATEGORY_COLORS = euiPaletteColorBlind({ rotations: 2 });

function categoryColor(category: string): string {
  const index = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
  return CATEGORY_COLORS[Math.max(0, index)];
}

export function ServicesStep({ onNext, onBack }: ServicesStepProps) {
  const {
    signalFilter,
    setSignalFilter,
    searchQuery,
    setSearchQuery,
    filteredServices,
    categories,
    activeCategory,
    setSelectedCategory,
    servicesInCategory,
    duplicateNamesInCategory,
    selectedSet,
    isReady,
    handleToggle,
    allInCategorySelected,
    handleSelectAllInCategory,
    handleDeselectAllInCategory,
    handleNext,
  } = useServicesStep({ onNext });

  return (
    <div data-test-subj="onboardingStep-services">
      <EuiTitle size="l">
        <h2>
          <FormattedMessage
            id="xpack.ingestHub.servicesStep.title"
            defaultMessage="Which AWS services do you want to monitor?"
          />
        </h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText color="subdued">
        <p>
          <FormattedMessage
            id="xpack.ingestHub.servicesStep.subtitle"
            defaultMessage="Select the services you use. Elastic will set up everything needed to start collecting data from your AWS account."
          />
        </p>
      </EuiText>
      <EuiSpacer size="l" />
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            compressed
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={i18n.translate('xpack.ingestHub.servicesStep.searchPlaceholder', {
              defaultMessage: 'Search services',
            })}
            data-test-subj="servicesStep-searchBox"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend={i18n.translate('xpack.ingestHub.servicesStep.filter.legend', {
              defaultMessage: 'Filter by signal type',
            })}
            options={SIGNAL_FILTER_OPTIONS}
            idSelected={signalFilter}
            onChange={(id) => setSignalFilter(id as SignalFilter)}
            buttonSize="compressed"
            data-test-subj="servicesStep-signalFilter"
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="s" />

      <EuiFlexGroup gutterSize="m" alignItems="flexStart" responsive={false}>
        <EuiFlexItem grow={false} style={{ width: 240 }}>
          {categories.map((cat) => {
            const isActive = cat === activeCategory;
            const catServices = filteredServices.filter((s) => s.category === cat);
            const catSelectedCount = catServices.filter((s) => selectedSet.has(s.id)).length;
            const uniqueNames = [...new Set(catServices.map((s) => s.name))];
            const preview =
              uniqueNames.slice(0, 2).join(', ') + (uniqueNames.length > 2 ? ', ...' : '');

            return (
              <EuiPanel
                key={cat}
                paddingSize="s"
                hasBorder={false}
                hasShadow={false}
                color={isActive ? 'subdued' : 'transparent'}
                onClick={() => setSelectedCategory(cat)}
                style={{ cursor: 'pointer' }}
                data-test-subj={`servicesStep-category-${cat}`}
              >
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem>
                    <EuiHealth color={categoryColor(cat)} textSize="s">
                      {cat}
                    </EuiHealth>
                    <EuiText size="xs" color="subdued" style={{ paddingLeft: 20 }}>
                      {preview}
                    </EuiText>
                  </EuiFlexItem>
                  {catSelectedCount > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">{catSelectedCount}</EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiPanel>
            );
          })}
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            {activeCategory ? (
              <>
                <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiTitle size="xs">
                      <h3>{activeCategory}</h3>
                    </EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    {allInCategorySelected ? (
                      <EuiButtonEmpty
                        size="s"
                        onClick={handleDeselectAllInCategory}
                        data-test-subj="servicesStep-deselectAllButton"
                      >
                        <FormattedMessage
                          id="xpack.ingestHub.servicesStep.deselectAll"
                          defaultMessage="Deselect all"
                        />
                      </EuiButtonEmpty>
                    ) : (
                      <EuiButtonEmpty
                        size="s"
                        onClick={handleSelectAllInCategory}
                        data-test-subj="servicesStep-selectAllButton"
                      >
                        <FormattedMessage
                          id="xpack.ingestHub.servicesStep.selectAll"
                          defaultMessage="Select all"
                        />
                      </EuiButtonEmpty>
                    )}
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="s" />
                <EuiFlexGrid columns={2} gutterSize="s">
                  {servicesInCategory.map((service) => (
                    <EuiFlexItem key={service.id}>
                      <ServiceRow
                        service={service}
                        isSelected={selectedSet.has(service.id)}
                        onToggle={handleToggle}
                        displayName={
                          duplicateNamesInCategory.has(service.name)
                            ? `${service.name} ${SIGNAL_TYPE_LABELS[service.signalType]}`
                            : undefined
                        }
                      />
                    </EuiFlexItem>
                  ))}
                </EuiFlexGrid>
              </>
            ) : null}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          {onBack && (
            <EuiButtonEmpty iconType="arrowLeft" iconSide="left" onClick={onBack}>
              <FormattedMessage
                id="xpack.ingestHub.servicesStep.backButton"
                defaultMessage="Back"
              />
            </EuiButtonEmpty>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            onClick={handleNext}
            isDisabled={!isReady}
            data-test-subj="servicesStep-nextButton"
          >
            <FormattedMessage id="xpack.ingestHub.servicesStep.nextButton" defaultMessage="Next" />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
}
