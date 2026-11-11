import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/core/auth/session';
import { handleApiError } from '@/core/http';
import { deletePoint, updatePoint } from '@/core/points/service';

const hourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/, 'Формат ЧЧ:ММ'),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/, 'Формат ЧЧ:ММ'),
  isClosed: z.boolean(),
});

const pointSchema = z.object({
  name: z.string().min(2, 'Укажите название точки'),
  address: z.string().min(3, 'Укажите адрес точки'),
  phone: z.string().min(5, 'Укажите телефон точки'),
  prepMinutes: z.number().int().min(1).max(180),
  slotStepMinutes: z.number().int().min(5).max(60),
  acceptsOrders: z.boolean(),
  isHidden: z.boolean(),
  services: z.array(z.string()).optional(),
  hours: z.array(hourSchema),
});

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    const body = await req.json();
    const parsed = pointSchema.parse(body);
    const point = await updatePoint(Number(id), parsed);
    return NextResponse.json({ point });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['admin']);
    const { id } = await context.params;
    await deletePoint(Number(id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
