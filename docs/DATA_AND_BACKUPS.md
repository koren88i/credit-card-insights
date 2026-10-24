# Local Data, Privacy, and Backups

## Where data is stored

By default, all app data stays under the project's ignored `data/` directory. Existing data remains in place. To use a different private directory, set `CREDIT_CARD_INSIGHTS_DATA_DIR` to its absolute path before starting the server. Stop the app before moving an existing data directory and point the setting at the complete copied directory.

- `data/credit-card-insights.sqlite` — transactions, categories, merchant rules, AI results, and audit events.
- `data/uploads/` — copies of statements after you commit an import.
- `data/staging/` — statement copies and parsed previews before you commit. Previews expire after 24 hours; the next import or commit removes expired preview files.
- `data/.api-access-token` — a random local API access token, created at runtime. Keep it private along with the database.
- `data/deleted-transactions/` — recovery snapshots created by a deliberate local cleanup script, if one has been run.

Neither location is committed to Git. The application binds to `127.0.0.1:3000`, so it is not exposed to your local network.

The app rejects unexpected hosts, cross-origin API calls, anonymous API reads, and unsupported write content types. The local app page supplies the API token automatically, including when downloading a backup. Reload an old browser tab after updating the app. These protections do not provide separate user accounts or make the app suitable for public hosting.

Private runtime directories are excluded from standalone build tracing and container build contexts. The build removes old standalone output and fails if private runtime files appear in the new release. Use a clean source checkout for releases, and never upload your runtime directory or its contents.

## Import safety

Each file is hashed to prevent an exact re-import. Voucher duplicates for the same card are skipped. Rows without vouchers that look duplicated are retained but marked as ambiguous rather than silently discarded.

Imports are limited to 20 files and 20 MB per batch, 5 MB per file, and 20,000 worksheet rows with at most 64 columns per file. Reporting periods must use valid calendar months, be ordered, and cover at most 240 months.

Original merchant text, source file, purchase date, card ending, voucher, and raw row payload are stored for traceability.

## Back up your data

Open **Settings** and select **Download local backup** to export JSON containing transactions, categories, merchants, and rules. Keep this export somewhere safe, because it contains sensitive financial information.

For a complete local copy, make a copy of the ignored `data/` directory while the app is stopped. Do not share that folder or its exports publicly.

Deletion snapshots contain the complete original rows and can be used to restore a deliberate cleanup. They are sensitive financial data and should be protected like the main database.

## AI privacy

Ollama runs locally. The app calls its local server only and sends batched merchant descriptions plus available category choices. It does not use cloud AI or send data to a remote service.
