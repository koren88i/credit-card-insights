import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allCategories, db } from '@/lib/db';
import { categoryId } from '@/lib/categories';

export const runtime = 'nodejs';
export function GET() { return NextResponse.json(allCategories()); }
const createSchema = z.object({ groupName: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(50) });
export async function POST(request: Request) {
  try {
    const { groupName, name } = createSchema.parse(await request.json());
    const id = categoryId(groupName, name);
    db().prepare('INSERT INTO categories (id, group_name, name, sort_order) VALUES (?, ?, ?, ?)').run(id, groupName, name, Date.now());
    return NextResponse.json({ id, groupName, name });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create category.' }, { status: 400 }); }
}

const updateSchema = z.object({ id: z.string().min(1), groupName: z.string().trim().min(1).max(50).optional(), name: z.string().trim().min(1).max(50).optional(), isActive: z.boolean().optional() });
export async function PATCH(request: Request) {
  try {
    const { id, groupName, name, isActive } = updateSchema.parse(await request.json());
    const current = db().prepare('SELECT id, group_name as groupName, name, is_active as isActive FROM categories WHERE id = ?').get(id) as { id: string; groupName: string; name: string; isActive: number } | undefined;
    if (!current) throw new Error('Category not found.');
    db().prepare('UPDATE categories SET group_name = ?, name = ?, is_active = ? WHERE id = ?').run(groupName ?? current.groupName, name ?? current.name, isActive === undefined ? current.isActive : Number(isActive), id);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not update category.' }, { status: 400 }); }
}
