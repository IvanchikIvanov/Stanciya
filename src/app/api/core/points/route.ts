import { NextResponse } from 'next/server';
import { handleApiError } from '@/core/http';
import { listPublicPoints } from '@/core/points/service';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const service = searchParams.get('service') || 'coffee';
    const points = await listPublicPoints(service);
    return NextResponse.json({ points });
  } catch (err) {
    return handleApiError(err);
  }
}
