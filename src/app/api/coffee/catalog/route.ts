import { NextResponse } from 'next/server';
import { handleApiError } from '@/core/http';
import { getActivePromoBlocks, getHomeBlocks } from '@/core/modules';
import { listPublicPoints } from '@/core/points/service';
import { getPublicCatalog } from '@/modules/coffee/catalog/service';
import '@/modules';

export async function GET() {
  try {
    const [{ categories, products }, points] = await Promise.all([
      getPublicCatalog(),
      listPublicPoints('coffee'),
    ]);

    return NextResponse.json({
      categories,
      products,
      points,
      homeBlocks: getHomeBlocks(),
      promoBlocks: getActivePromoBlocks(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
