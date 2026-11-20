import { NextResponse } from 'next/server';
import { handleApiError } from '@/core/http';
import { getHomeBlocks } from '@/core/modules';
import { getActivePromoBlocks } from '@/core/settings/service';
import { listPublicPoints } from '@/core/points/service';
import { getPublicCatalog } from '@/modules/coffee/catalog/service';
import { getAllStopLists } from '@/modules/coffee/stoplist/service';
import '@/modules';

export async function GET() {
  try {
    const [{ categories, products }, points, stopLists] = await Promise.all([
      getPublicCatalog(),
      listPublicPoints('coffee'),
      getAllStopLists(),
    ]);

    return NextResponse.json({
      categories,
      products,
      points,
      // pointId → товары, снятые бариста с наличия на этой точке
      stopLists,
      homeBlocks: getHomeBlocks(),
      promoBlocks: await getActivePromoBlocks(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
