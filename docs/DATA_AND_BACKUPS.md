# Local Data, Privacy, and Backups

## Where data is stored

All app data stays under the project's ignored `data/` directory:

- `data/credit-card-insights.sqlite` — transactions, categories, merchant rules, AI results, and audit events.
- `data/uploads/` — copies of statements after you commit an import.
- `data/deleted-transactions/` — recovery snapshots created by a deliberate local cleanup script, if one has been run.

Neither location is committed to Git. The application binds to `127.0.0.1:3000`, so it is not exposed to your local network.

## Import safety

Each file is hashed to prevent an exact re-import. Voucher duplicates for the same card are skipped. Rows without vouchers that look duplicated are retained but marked as ambiguous rather than silently discarded.

Original merchant text, source file, purchase date, card ending, voucher, and raw row payload are stored for traceability.

## Back up your data

Open **Settings** and select **Download local backup** to export JSON containing transactions, categories, merchants, and rules. Keep this export somewhere safe, because it contains sensitive financial information.

For a complete local copy, make a copy of the ignored `data/` directory while the app is stopped. Do not share that folder or its exports publicly.

Deletion snapshots contain the complete original rows and can be used to restore a deliberate cleanup. They are sensitive financial data and should be protected like the main database.

## AI privacy

Ollama runs locally. The app calls its local server only and sends batched merchant descriptions plus available category choices. It does not use cloud AI or send data to a remote service.
