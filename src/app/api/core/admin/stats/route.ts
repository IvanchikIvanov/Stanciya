import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { collectModulesStats, getAdminNavigation } from '@/core/modules';
import '@/modules';

const querySchema = z.object({
  period: z.enum(['today', '7d', '30d', 'custom']).default('today'),
  from: z.string().optional(),
  to: z.string().optional(),
  pointId: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    await requireRole(['admin']);
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.parse({
      period: searchParams.get('period') || 'today',
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      pointId: searchParams.get('pointId') || undefined,
    });

    const blocks = await collectModulesStats({
      period: parsed.period,
      from: parsed.from,
      to: parsed.to,
      pointId: parsed.pointId ? Number(parsed.pointId) : null,
    });

    return NextResponse.json({
      blocks,
      nav: getAdminNavigation(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
