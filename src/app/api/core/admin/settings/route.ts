import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { listSettings, updateSettings } from '@/core/settings/service';
import '@/modules';

const schema = z.object({
  values: z.record(z.string(), z.union([z.number(), z.string()])),
});

export async function GET() {
  try {
    await requireRole(['admin']);
    return NextResponse.json({ settings: await listSettings() });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireRole(['admin']);
    const parsed = schema.parse(await req.json());
    const settings = await updateSettings(parsed.values, user.id);
    return NextResponse.json({ settings });
  } catch (err) {
    return handleApiError(err);
  }
}
