# Using Credit Card Insights

## Start the app

Install Node.js 22 or 24. From the project directory, install dependencies once, then start the app:

```sh
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` if your execution policy blocks `npm`.

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app is available only on this PC.

## Import statements

1. Open **Import** and select one or more `.xlsx` statements.
2. Review the parsed, ignored, and duplicate-file counts.
3. Select **Commit** to save the statements atomically.

Each batch can contain up to 20 files totaling 20 MB, with a 5 MB limit per statement. A worksheet can contain up to 20,000 rows and 64 columns. Import previews expire after 24 hours; select the files again if a preview has expired.

The importer supports the known Hebrew transaction headers, ignores pending or unbilled sections without a charged amount, and derives card ending and statement month from filenames in the form `NNNN_MM_YYYY.xlsx`. For example, the synthetic filename `1111_01_2026.xlsx` represents card ending `1111` and statement month January 2026. Select files from any folder on your computer; no particular statement folder is required.

## Explore spending

Use the shared filters for purchase date or statement month, card, category, merchant text, and date range. The overview separates spending from refunds and credits. Click a category chart segment or a top merchant to open the matching transactions.

Choose valid calendar months in chronological order. A reporting range can cover up to 240 months.

The app starts with **Statement month** selected. Use it for what appeared on a specific card statement, which is helpful for installments. Switch to **Purchase date** when you need to analyze when something was bought.

The **Transactions** page opens grouped by merchant so you can categorize the largest groups first. Sort groups by largest spend or transaction count, and select **Uncategorized** in the Category filter to focus on rows that still need a category. Switch to **Individual rows** to inspect individual transactions. Click any column header to sort that table; click it again to reverse the direction.

Click a month in either stacked overview chart to open its inline drill-down. In the drill-down, click a category slice to show only that category’s transactions for the selected month. Click the slice again or choose **Show all** to reset. Its transaction columns are sortable too.

Category colors stay consistent between the overview and drill-down charts. The expanded high-contrast palette supports 30 distinct category colors before any color is reused.

Use **Exclude from reports** on a transaction's merchant to remove that merchant from all report totals without deleting its data. Turn on **Include excluded merchants** in the filter bar to compare the effect or to include that merchant again.

## Categories

The default hierarchy includes Food, Home, Mobility, Health, Lifestyle, Financial, and Other. Open **Categories** to add, rename, or disable categories.

You can also choose **+ Create new category...** directly from a transaction or review-queue category picker. Enter a group and category name; it is created and immediately applied to that merchant.
