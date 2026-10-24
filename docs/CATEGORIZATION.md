# Categorization and Merchant Rules

## How a category is selected

The app uses this order:

1. A category you confirmed for a merchant.
2. An existing high-confidence AI merchant rule.
3. A small set of deterministic starter rules for common merchants and keywords.
4. A local-AI suggestion.
5. Uncategorized.

Raw merchant text is always preserved. The normalized merchant key uses conservative cleanup (Unicode, whitespace, punctuation, and safe suffix cleanup) and does not fuzzy-merge unrelated merchants.

## Change one, change all

Every category decision is merchant-wide by design. In **Transactions**, select a category then press **All rows**. In **Review queue**, select a category and press **Apply to all merchant rows**.

That creates or replaces a merchant rule, updates every existing row with the same normalized merchant, and categorizes all future imports of that merchant. It does not change other merchants.

The notification after a change includes **Undo**, which restores the prior rule and recategorizes the affected merchant history.

## Local AI categorization

Install the recommended model once:

```powershell
ollama pull gemma3:4b
```

Then choose **Categorize unknown merchants**. The app verifies that Ollama and the model are available; it never downloads a model itself.

Unknown merchants are sent to Ollama in batches of at most 50 groups, not one transaction at a time. Each request contains only a merchant identifier, representative merchant string, and permitted category IDs/names. No transaction amounts, dates, vouchers, or statement files are sent to the model.

The response must match the app's strict JSON schema. Suggestions with at least 95% confidence become AI merchant rules automatically. Lower-confidence suggestions stay in **Review queue** until you decide. Completed merchant classifications are cached, so known merchants are not sent again.
