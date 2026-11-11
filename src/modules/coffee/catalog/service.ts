import { query } from '@/core/db';

export interface ModifierOptionDto {
  id: number;
  groupId: number;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  isDefault: boolean;
  sortOrder: number;
}

export interface ModifierGroupDto {
  id: number;
  name: string;
  selectType: 'single' | 'multiple';
  isRequired: boolean;
  options: ModifierOptionDto[];
}

export interface CatalogProductDto {
  id: number;
  categoryId: number;
  name: string;
  description: string;
  imageUrl: string | null;
  basePrice: number;
  fromPrice: number;
  isPublished: boolean;
  inStock: boolean;
  modifierGroups: ModifierGroupDto[];
}

export interface CatalogCategoryDto {
  id: number;
  name: string;
  sortOrder: number;
  isPublished: boolean;
}

export function calculateProductFromPrice(
  basePrice: number,
  modifierGroups: ModifierGroupDto[]
): number {
  let extra = 0;
  for (const grp of modifierGroups) {
    if (!grp.isRequired) continue;
    const defaultOpt =
      grp.options.find((o) => o.isDefault && o.isAvailable) ??
      grp.options.find((o) => o.isAvailable);
    if (defaultOpt) {
      extra += defaultOpt.priceDelta;
    }
  }
  return basePrice + extra;
}

export async function getPublicCatalog(): Promise<{
  categories: CatalogCategoryDto[];
  products: CatalogProductDto[];
}> {
  const catRes = await query<{
    id: number;
    name: string;
    sort_order: number;
    is_published: boolean;
  }>(
    `SELECT id, name, sort_order, is_published
     FROM coffee_categories
     WHERE is_published = TRUE
     ORDER BY sort_order ASC, id ASC`
  );

  const categories: CatalogCategoryDto[] = catRes.rows.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    isPublished: c.is_published,
  }));

  if (categories.length === 0) {
    return { categories: [], products: [] };
  }

  const prodRes = await query<{
    id: number;
    category_id: number;
    name: string;
    description: string;
    image_url: string | null;
    base_price: number;
    is_published: boolean;
    in_stock: boolean;
  }>(
    `SELECT p.id, p.category_id, p.name, p.description, p.image_url, p.base_price, p.is_published, p.in_stock
     FROM coffee_products p
     JOIN coffee_categories c ON c.id = p.category_id
     WHERE p.deleted_at IS NULL
       AND p.is_published = TRUE
       AND c.is_published = TRUE
     ORDER BY c.sort_order ASC, p.id ASC`
  );

  const linkRes = await query<{
    product_id: number;
    group_id: number;
    sort_order: number;
  }>(
    `SELECT product_id, group_id, sort_order
     FROM coffee_product_modifier_groups
     ORDER BY sort_order ASC, group_id ASC`
  );

  const groupsRes = await query<{
    id: number;
    name: string;
    select_type: 'single' | 'multiple';
    is_required: boolean;
  }>(`SELECT id, name, select_type, is_required FROM coffee_modifier_groups ORDER BY id ASC`);

  const optionsRes = await query<{
    id: number;
    group_id: number;
    name: string;
    price_delta: number;
    is_available: boolean;
    is_default: boolean;
    sort_order: number;
  }>(
    `SELECT id, group_id, name, price_delta, is_available, is_default, sort_order
     FROM coffee_modifier_options
     ORDER BY sort_order ASC, id ASC`
  );

  const groupMap = new Map<number, ModifierGroupDto>();
  for (const g of groupsRes.rows) {
    const opts = optionsRes.rows
      .filter((o) => o.group_id === g.id)
      .map((o) => ({
        id: o.id,
        groupId: o.group_id,
        name: o.name,
        priceDelta: o.price_delta,
        isAvailable: o.is_available,
        isDefault: o.is_default,
        sortOrder: o.sort_order,
      }));
    groupMap.set(g.id, {
      id: g.id,
      name: g.name,
      selectType: g.select_type,
      isRequired: g.is_required,
      options: opts,
    });
  }

  const products: CatalogProductDto[] = prodRes.rows.map((p) => {
    const prodLinks = linkRes.rows.filter((l) => l.product_id === p.id);
    const modifierGroups: ModifierGroupDto[] = [];
    for (const l of prodLinks) {
      const grp = groupMap.get(l.group_id);
      if (grp) modifierGroups.push(grp);
    }

    return {
      id: p.id,
      categoryId: p.category_id,
      name: p.name,
      description: p.description,
      imageUrl: p.image_url,
      basePrice: p.base_price,
      fromPrice: calculateProductFromPrice(p.base_price, modifierGroups),
      isPublished: p.is_published,
      inStock: p.in_stock,
      modifierGroups,
    };
  });

  return { categories, products };
}

export interface CartCheckItemInput {
  productId: number;
  optionIds: number[];
  quantity: number;
  clientUnitPrice?: number;
}

export interface CartCheckItemResult {
  productId: number;
  optionIds: number[];
  quantity: number;
  productName: string;
  available: boolean;
  unavailableReason?: string;
  unitPrice: number;
  lineTotal: number;
  priceChanged: boolean;
  modifiers: Array<{
    groupId: number;
    groupName: string;
    optionId: number;
    optionName: string;
    priceDelta: number;
  }>;
}

export async function verifyCartItems(items: CartCheckItemInput[]): Promise<{
  items: CartCheckItemResult[];
  total: number;
  hasUnavailable: boolean;
  hasPriceChanges: boolean;
}> {
  const { products } = await getPublicCatalog();
  const prodMap = new Map(products.map((p) => [p.id, p]));

  const results: CartCheckItemResult[] = [];
  let total = 0;
  let hasUnavailable = false;
  let hasPriceChanges = false;

  for (const item of items) {
    const prod = prodMap.get(item.productId);
    if (!prod || !prod.isPublished || !prod.inStock) {
      hasUnavailable = true;
      results.push({
        productId: item.productId,
        optionIds: item.optionIds,
        quantity: item.quantity,
        productName: prod?.name ?? 'Товар недоступен',
        available: false,
        unavailableReason: 'Нет в наличии',
        unitPrice: prod?.basePrice ?? item.clientUnitPrice ?? 0,
        lineTotal: 0,
        priceChanged: false,
        modifiers: [],
      });
      continue;
    }

    const selectedOptionSet = new Set(item.optionIds);
    const resolvedModifiers: CartCheckItemResult['modifiers'] = [];
    let optionsValid = true;

    for (const grp of prod.modifierGroups) {
      const chosenInGroup = grp.options.filter((o) => selectedOptionSet.has(o.id));
      if (grp.isRequired && chosenInGroup.length === 0) {
        optionsValid = false;
      }
      if (grp.selectType === 'single' && chosenInGroup.length > 1) {
        optionsValid = false;
      }
      for (const opt of chosenInGroup) {
        if (!opt.isAvailable) {
          optionsValid = false;
        }
        resolvedModifiers.push({
          groupId: grp.id,
          groupName: grp.name,
          optionId: opt.id,
          optionName: opt.name,
          priceDelta: opt.priceDelta,
        });
      }
    }

    if (resolvedModifiers.length !== selectedOptionSet.size) {
      optionsValid = false;
    }

    if (!optionsValid) {
      hasUnavailable = true;
      results.push({
        productId: item.productId,
        optionIds: item.optionIds,
        quantity: item.quantity,
        productName: prod.name,
        available: false,
        unavailableReason: 'Нет в наличии',
        unitPrice: prod.basePrice,
        lineTotal: 0,
        priceChanged: false,
        modifiers: resolvedModifiers,
      });
      continue;
    }

    const deltaSum = resolvedModifiers.reduce((acc, m) => acc + m.priceDelta, 0);
    const unitPrice = prod.basePrice + deltaSum;
    const qty = Math.min(20, Math.max(1, Math.floor(item.quantity)));
    const lineTotal = unitPrice * qty;
    const priceChanged =
      item.clientUnitPrice !== undefined && item.clientUnitPrice !== unitPrice;

    if (priceChanged) {
      hasPriceChanges = true;
    }

    total += lineTotal;
    results.push({
      productId: item.productId,
      optionIds: item.optionIds,
      quantity: qty,
      productName: prod.name,
      available: true,
      unitPrice,
      lineTotal,
      priceChanged,
      modifiers: resolvedModifiers,
    });
  }

  return {
    items: results,
    total,
    hasUnavailable,
    hasPriceChanges,
  };
}
