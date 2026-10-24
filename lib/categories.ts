export const DEFAULT_CATEGORIES = [
  ['Food', 'Groceries'], ['Food', 'Dining'],
  ['Home', 'Utilities'], ['Home', 'Household'],
  ['Mobility', 'Transport'], ['Mobility', 'Fuel & parking'],
  ['Health', 'Pharmacy & medical'],
  ['Lifestyle', 'Shopping'], ['Lifestyle', 'Entertainment'], ['Lifestyle', 'Sports'],
  ['Financial', 'Insurance'], ['Financial', 'Fees'],
  ['Other', 'Travel'], ['Other', 'Education'], ['Other', 'Subscriptions'],
  ['Other', 'Gifts & donations'], ['Other', 'Other'],
] as const;

export const STARTER_RULES: Array<{ match: RegExp; category: string }> = [
  { match: /סופר.?פארם|be פארם|בית מרקחת/, category: 'Pharmacy & medical' },
  { match: /שופרסל|רמי לוי|ויקטורי|יינות ביתן|סופר(?! ?פארם)/, category: 'Groceries' },
  { match: /wolt|תן ביס|מסעדה|קפה|פיצה|מאפיי/, category: 'Dining' },
  { match: /סלקום|פרטנר|פלאפון|בזק|חשמל|מי |גז/, category: 'Utilities' },
  { match: /רכבת|רב.?קו|דלק|פז |סונול|yellow|חניה|gett|uber/, category: 'Transport' },
  { match: /נטפליקס|spotify|ספוטיפיי|apple\.com|google.*youtube/, category: 'Subscriptions' },
  { match: /ביטוח|הראל|מגדל|כלל ביטוח|איילון/, category: 'Insurance' },
];

function unicodeKey(value: string) {
  return `u${Array.from(value).map((character) => character.codePointAt(0)!.toString(16).padStart(4, '0')).join('_')}`;
}

function categoryPart(value: string) {
  const normalized = value.trim().toLowerCase();
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (slug && /^[\x00-\x7f]*$/.test(normalized)) return slug;
  return `${slug || 'category'}-${unicodeKey(normalized)}`;
}

export function categoryId(group: string, name: string) {
  return `${categoryPart(group)}-${categoryPart(name)}`;
}
