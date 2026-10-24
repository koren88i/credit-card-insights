import { STARTER_RULES } from './categories';

export function normalizeMerchant(input: string) {
  return input
    .normalize('NFKC')
    .replace(/[\u200e\u200f]/g, '')
    .replace(/["'׳״]/g, '')
    .replace(/בע"?מ|בעמ|ltd\.?/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function starterCategory(rawMerchant: string) {
  const normalized = normalizeMerchant(rawMerchant);
  return STARTER_RULES.find((rule) => rule.match.test(normalized))?.category;
}
