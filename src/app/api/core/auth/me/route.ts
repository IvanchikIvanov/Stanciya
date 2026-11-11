import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/core/auth/session';
import { handleApiError } from '@/core/http';

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (err) {
    return handleApiError(err);
  }
}
