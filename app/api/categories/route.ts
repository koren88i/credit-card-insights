import { secureApi } from '@/lib/secure-api';
import { readJson, apiError } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { allCategories, db } from '@/lib/db';
import { categoryId } from '@/lib/categories';

export const runtime = 'nodejs';
function handleGET() { return NextResponse.json(allCategories()); }
const createSchema = z.object({ groupName: z.string().trim().min(1).max(50), name: z.string().trim().min(1).max(50) });
async function handlePOST(request: Request) {
  try {
    const { groupName, name } = createSchema.parse(await readJson(request));
    const id = categoryId(groupName, name);
    db().prepare('INSERT INTO categories (id, group_name, name, sort_order) VALUES (?, ?, ?, ?)').run(id, groupName, name, Date.now());
    return NextResponse.json({ id, groupName, name });
  } catch (error) { return apiError(error, 'Could not create category.'); }
}

const updateSchema = z.object({ id: z.string().min(1), groupName: z.string().trim().min(1).max(50).optional(), name: z.string().trim().min(1).max(50).optional(), isActive: z.boolean().optional() });
async function handlePATCH(request: Request) {
  try {
    const { id, groupName, name, isActive } = updateSchema.parse(await readJson(request));
    const current = db().prepare('SELECT id, group_name as groupName, name, is_active as isActive FROM categories WHERE id = ?').get(id) as { id: string; groupName: string; name: string; isActive: number } | undefined;
    if (!current) throw new Error('Category not found.');
    db().prepare('UPDATE categories SET group_name = ?, name = ?, is_active = ? WHERE id = ?').run(groupName ?? current.groupName, name ?? current.name, isActive === undefined ? current.isActive : Number(isActive), id);
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error, 'Could not update category.'); }
}

export const GET = secureApi(handleGET);
export const POST = secureApi(handlePOST);
export const PATCH = secureApi(handlePATCH);
