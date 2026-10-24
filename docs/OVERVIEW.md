# Overview and Drill-Downs

## Choose the analysis basis

The Overview defaults to **Statement month**.

The **Analyze by** filter changes how dates are interpreted:

- **Purchase date** shows when something was bought. Its timeline can begin before the first imported statement when an installment purchase has an older purchase date.
- **Statement month** shows when a charge appeared on a card statement. Use it to compare statement periods and installment charges.

## Time slider

The Overview has a two-handle month slider. Drag either handle to set the shared reporting period. It updates all overview metrics and charts while preserving card, category, merchant, search, and excluded-merchant filters.

The slider covers the available range for the selected analysis basis. A purchase-date timeline may therefore start earlier than the first statement month.

## Monthly charts

The full-width **Monthly spending by category** chart uses a stacked bar for each month. Months with no spending remain visible as zero bars so the timeline never skips a month. The **Monthly spending by card** chart uses the same behavior.

Each category keeps the same color in the monthly chart and the month drill-down chart. The palette provides 30 high-contrast colors, so the current active categories and **Uncategorized** do not repeat colors.

Hover a bar segment to see its value. Click any segment in either monthly stacked chart to open an inline drill-down without changing the slider or leaving Overview.

## Month drill-down

The inline drill-down appears directly below the monthly category chart. It shows:

- total spending and transaction count for the selected month;
- a spend-by-category chart using the matching category colors; and
- the matching transactions, with purchase date, merchant, category, card, and amount.

Click a category slice to filter the drill-down table to that category within the selected month. Click the same slice again, or select **Show all**, to restore every transaction. The selected slice remains fully visible while the other slices dim.

Every drill-down table header is sortable. Select a header to sort ascending and select it again to reverse the direction. The full **Transactions** page offers the same sorting for all of its columns.

Close the drill-down to return to the normal overview. The main date range remains unchanged throughout.

## Refunds and credits

**Spending** is the gross value of charge transactions. **Refunds & credits** are positive card entries: refunds, reversed purchases, corrections, or other money credited back to the card. They are reported separately and are not subtracted from gross spending.

Refunds are not a separate category slice in the category charts. They remain visible in the applicable transaction tables and retain their merchant category when one is assigned.
