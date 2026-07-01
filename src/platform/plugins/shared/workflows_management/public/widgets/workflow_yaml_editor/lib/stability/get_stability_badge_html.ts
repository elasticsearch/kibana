/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { StabilityLevel } from '@kbn/workflows';
import type { StabilityBadgeColors } from './stability_badge_theme';
import { getStabilityBadgeColors } from './stability_badge_theme';

/** Matches EuiBetaBadge size="s" hollow footprint (see get_suggest_tech_preview_badge_styles). */
export const STABILITY_BADGE_HEIGHT_PX = 18;

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Hover stability badge as an SVG data-URL {@code img}. Monaco markdown hovers are sanitized
 * by DOMPurify: custom {@code span}/{@code div} classes and most inline styles are stripped
 * (EUI/React markup is not usable here), so styled badges render as plain text. SVG in
 * {@code img src="data:image/svg+xml,..."} survives. Colors from {@link getStabilityBadgeColors}
 * ({@link setStabilityBadgeThemeContext} on editor mount). Visually approximates
 * {@code EuiBetaBadge} size {@code s} hollow.
 */
export function buildStabilityBadgeHtml(label: string, colors: StabilityBadgeColors): string {
  const escapedLabel = escapeSvgText(label);
  const width = Math.max(48, Math.ceil(label.length * 6.5) + 20);
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${STABILITY_BADGE_HEIGHT_PX}" viewBox="0 0 ${width} ${STABILITY_BADGE_HEIGHT_PX}">`,
    `<rect x="0.5" y="0.5" width="${width - 1}" height="${
      STABILITY_BADGE_HEIGHT_PX - 1
    }" rx="8.5" fill="${colors.fill}" stroke="${colors.stroke}"/>`,
    `<text x="${
      width / 2
    }" y="13" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="11" font-weight="600" fill="${
      colors.text
    }">${escapedLabel}</text>`,
    '</svg>',
  ].join('');
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`;

  return `<img src="${dataUrl}" alt="${escapeHtmlAttribute(
    label
  )}" width="${width}" height="${STABILITY_BADGE_HEIGHT_PX}" />`;
}

/**
 * Returns HTML for a compact stability badge (matches actions menu EuiBetaBadge).
 */
export function getStabilityBadgeHtml(stability: StabilityLevel | undefined): string {
  if (stability === 'tech_preview') {
    const label = i18n.translate('workflows.actionsMenu.techPreviewBadge', {
      defaultMessage: 'Tech preview',
    });
    return buildStabilityBadgeHtml(label, getStabilityBadgeColors());
  }
  if (stability === 'beta') {
    const label = i18n.translate('workflows.actionsMenu.betaBadge', {
      defaultMessage: 'Beta',
    });
    return buildStabilityBadgeHtml(label, getStabilityBadgeColors());
  }
  return '';
}
