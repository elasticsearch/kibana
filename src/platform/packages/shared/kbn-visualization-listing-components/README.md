# @kbn/visualization-listing-components

Shared components and utilities for visualization listing pages.

## Purpose

This package provides utilities for displaying visualizations in listing/table views. It's used by:

- Visualizations plugin (for the Visualize Library listing)
- Visualization Listing plugin (for visualization tab in Dashboards)

## Contents

- `getCustomColumn()` - Custom column renderer for visualization type with icons and badges
- `getCustomSortingOptions()` - Sorting options for visualization type column
- `getNoItemsMessage()` - Empty state prompt for when no visualizations exist

## Usage

```typescript
import { getCustomColumn, getNoItemsMessage } from '@kbn/visualization-listing-components';

const customColumn = getCustomColumn();
const emptyPrompt = getNoItemsMessage(createNewVis);
```
