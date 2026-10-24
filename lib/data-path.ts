import path from 'node:path';

export function dataDirectory() {
  // Runtime files are supplied by the user, never bundled into a release.
  return path.resolve(/*turbopackIgnore: true*/ process.env.CREDIT_CARD_INSIGHTS_DATA_DIR || path.join(process.cwd(), 'data'));
}
