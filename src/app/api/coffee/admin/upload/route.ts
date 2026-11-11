import { NextResponse } from 'next/server';
import { requireRole } from '@/core/auth/session';
import { AppError } from '@/core/errors';
import { handleApiError } from '@/core/http';
import { saveUploadedProductImage } from '@/modules/coffee/admin/service';

export async function POST(req: Request) {
  try {
    await requireRole(['admin']);
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      throw new AppError(400, 'FILE_REQUIRED', 'Выберите изображение для загрузки');
    }
    const imageUrl = await saveUploadedProductImage(file);
    return NextResponse.json({ imageUrl }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
