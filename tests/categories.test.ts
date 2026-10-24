import { describe, expect, it } from 'vitest';
import { categoryId } from '../lib/categories';

describe('categoryId', () => {
  it('preserves the existing readable IDs for ASCII categories', () => {
    expect(categoryId('Food', 'Groceries')).toBe('food-groceries');
  });

  it('keeps distinct Hebrew category names distinct', () => {
    const general = categoryId('Other', 'חבר כללי');
    const topups = categoryId('Other', 'חבר טעינות');
    expect(general).not.toBe(topups);
    expect(categoryId('Other', 'חבר טעינות')).toBe(topups);
  });
});
