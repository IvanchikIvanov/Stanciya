import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { query, transaction } from '@/core/db';
import { getConfig } from '@/core/env';
import { AppError } from '@/core/errors';
import type {
  CatalogCategoryDto,
  ModifierGroupDto,
  ModifierOptionDto,
} from '../catalog/service';
import { calculateProductFromPrice } from '../catalog/service';

export interface AdminProductDto {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string;
  imageUrl: string | null;
  basePrice: number;
  fromPrice: number;
  isPublished: boolean;
  inStock: boolean;
  modifierGroupIds: number[];
}

export interface AdminModifierGroupDto extends ModifierGroupDto {
  attachedProducts: Array<{ id: number; name: string }>;
}

export async function listAdminCatalog(): Promise<{
  categories: CatalogCategoryDto[];
  products: AdminProductDto[];
  modifierGroups: AdminModifierGroupDto[];
}> {
  const catRes = await query<{
    id: number;
    name: string;
    sort_order: number;
    is_published: boolean;
  }>(
    `SELECT id, name, sort_order, is_published
     FROM coffee_categories
     ORDER BY sort_order ASC, id ASC`
  );

  const prodRes = await query<{
    id: number;
    category_id: number;
    category_name: string;
    name: string;
    description: string;
    image_url: string | null;
    base_price: number;
    is_published: boolean;
    in_stock: boolean;
  }>(
    `SELECT p.id, p.category_id, c.name AS category_name,
            p.name, p.description, p.image_url, p.base_price, p.is_published, p.in_stock
     FROM coffee_products p
     JOIN coffee_categories c ON c.id = p.category_id
     WHERE p.deleted_at IS NULL
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

  const modifierGroups = await listAdminModifierGroups();
  const groupMap = new Map(modifierGroups.map((g) => [g.id, g]));

  const categories: CatalogCategoryDto[] = catRes.rows.map((c) => ({
    id: c.id,
    name: c.name,
    sortOrder: c.sort_order,
    isPublished: c.is_published,
  }));

  const products: AdminProductDto[] = prodRes.rows.map((p) => {
    const links = linkRes.rows.filter((l) => l.product_id === p.id);
    const modifierGroupIds = links.map((l) => l.group_id);
    const attachedGroups = modifierGroupIds
      .map((gid) => groupMap.get(gid))
      .filter((g): g is AdminModifierGroupDto => Boolean(g));

    return {
      id: p.id,
      categoryId: p.category_id,
      categoryName: p.category_name,
      name: p.name,
      description: p.description,
      imageUrl: p.image_url,
      basePrice: p.base_price,
      fromPrice: calculateProductFromPrice(p.base_price, attachedGroups),
      isPublished: p.is_published,
      inStock: p.in_stock,
      modifierGroupIds,
    };
  });

  return { categories, products, modifierGroups };
}

export async function createCategory(input: {
  name: string;
  sortOrder: number;
  isPublished: boolean;
}): Promise<CatalogCategoryDto> {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Укажите название категории', {
      name: 'Укажите название категории',
    });
  }

  const ins = await query<{
    id: number;
    name: string;
    sort_order: number;
    is_published: boolean;
  }>(
    `INSERT INTO coffee_categories (name, sort_order, is_published)
     VALUES ($1, $2, $3)
     RETURNING id, name, sort_order, is_published`,
    [name, input.sortOrder, input.isPublished]
  );

  const r = ins.rows[0];
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    isPublished: r.is_published,
  };
}

export async function updateCategory(
  categoryId: number,
  input: { name: string; sortOrder: number; isPublished: boolean }
): Promise<CatalogCategoryDto> {
  const name = input.name.trim();
  if (!name) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Укажите название категории', {
      name: 'Укажите название категории',
    });
  }

  const upd = await query<{
    id: number;
    name: string;
    sort_order: number;
    is_published: boolean;
  }>(
    `UPDATE coffee_categories
     SET name = $1, sort_order = $2, is_published = $3
     WHERE id = $4
     RETURNING id, name, sort_order, is_published`,
    [name, input.sortOrder, input.isPublished, categoryId]
  );

  if (upd.rowCount === 0) {
    throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Категория не найдена');
  }

  const r = upd.rows[0];
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    isPublished: r.is_published,
  };
}

export async function deleteCategory(categoryId: number): Promise<void> {
  const activeProds = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM coffee_products
     WHERE category_id = $1 AND deleted_at IS NULL`,
    [categoryId]
  );

  if (Number(activeProds.rows[0]?.cnt ?? 0) > 0) {
    throw new AppError(
      409,
      'CATEGORY_HAS_PRODUCTS',
      'Удалить категорию с товарами нельзя'
    );
  }

  await transaction(async (tx) => {
    await tx.query(
      'DELETE FROM coffee_products WHERE category_id = $1 AND deleted_at IS NOT NULL',
      [categoryId]
    );
    const del = await tx.query('DELETE FROM coffee_categories WHERE id = $1', [
      categoryId,
    ]);
    if (del.rowCount === 0) {
      throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Категория не найдена');
    }
  });
}

export interface UpsertProductInput {
  categoryId: number;
  name: string;
  description: string;
  imageUrl?: string | null;
  basePrice: number;
  isPublished: boolean;
  inStock: boolean;
  modifierGroupIds: number[];
}

function validateProductInput(input: UpsertProductInput): void {
  const fields: Record<string, string> = {};
  if (!input.name || !input.name.trim()) {
    fields.name = 'Укажите название товара';
  }
  if (!Number.isInteger(input.basePrice) || input.basePrice < 0) {
    fields.basePrice = 'Укажите корректную базовую цену (целое число >= 0)';
  }
  if (!input.categoryId) {
    fields.categoryId = 'Выберите категорию';
  }
  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }
}

export async function createProduct(input: UpsertProductInput): Promise<AdminProductDto> {
  validateProductInput(input);

  const productId = await transaction(async (tx) => {
    const ins = await tx.query<{ id: number }>(
      `INSERT INTO coffee_products (
         category_id, name, description, image_url, base_price, is_published, in_stock
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        input.categoryId,
        input.name.trim(),
        (input.description ?? '').trim(),
        input.imageUrl ?? null,
        input.basePrice,
        input.isPublished,
        input.inStock,
      ]
    );

    const id = ins.rows[0].id;
    for (let i = 0; i < input.modifierGroupIds.length; i++) {
      await tx.query(
        `INSERT INTO coffee_product_modifier_groups (product_id, group_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [id, input.modifierGroupIds[i], (i + 1) * 10]
      );
    }
    return id;
  });

  const { products } = await listAdminCatalog();
  return products.find((p) => p.id === productId)!;
}

export async function updateProduct(
  productId: number,
  input: UpsertProductInput
): Promise<AdminProductDto> {
  validateProductInput(input);

  await transaction(async (tx) => {
    const existing = await tx.query<{ id: number }>(
      'SELECT id FROM coffee_products WHERE id = $1 AND deleted_at IS NULL',
      [productId]
    );
    if (existing.rowCount === 0) {
      throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
    }

    await tx.query(
      `UPDATE coffee_products
       SET category_id = $1,
           name = $2,
           description = $3,
           image_url = $4,
           base_price = $5,
           is_published = $6,
           in_stock = $7
       WHERE id = $8`,
      [
        input.categoryId,
        input.name.trim(),
        (input.description ?? '').trim(),
        input.imageUrl ?? null,
        input.basePrice,
        input.isPublished,
        input.inStock,
        productId,
      ]
    );

    await tx.query('DELETE FROM coffee_product_modifier_groups WHERE product_id = $1', [
      productId,
    ]);
    for (let i = 0; i < input.modifierGroupIds.length; i++) {
      await tx.query(
        `INSERT INTO coffee_product_modifier_groups (product_id, group_id, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [productId, input.modifierGroupIds[i], (i + 1) * 10]
      );
    }
  });

  const { products } = await listAdminCatalog();
  return products.find((p) => p.id === productId)!;
}

export async function softDeleteProduct(productId: number): Promise<void> {
  const res = await query(
    `UPDATE coffee_products SET deleted_at = NOW(), is_published = FALSE WHERE id = $1 AND deleted_at IS NULL`,
    [productId]
  );
  if (res.rowCount === 0) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Товар не найден');
  }
}

export async function listAdminModifierGroups(): Promise<AdminModifierGroupDto[]> {
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

  const attachedRes = await query<{
    group_id: number;
    product_id: number;
    product_name: string;
  }>(
    `SELECT pmg.group_id, p.id AS product_id, p.name AS product_name
     FROM coffee_product_modifier_groups pmg
     JOIN coffee_products p ON p.id = pmg.product_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.name ASC`
  );

  return groupsRes.rows.map((g) => {
    const options: ModifierOptionDto[] = optionsRes.rows
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

    const attachedProducts = attachedRes.rows
      .filter((a) => a.group_id === g.id)
      .map((a) => ({ id: a.product_id, name: a.product_name }));

    return {
      id: g.id,
      name: g.name,
      selectType: g.select_type,
      isRequired: g.is_required,
      options,
      attachedProducts,
    };
  });
}

export interface UpsertModifierOptionInput {
  id?: number;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
  isDefault: boolean;
  sortOrder?: number;
}

export interface UpsertModifierGroupInput {
  name: string;
  selectType: 'single' | 'multiple';
  isRequired: boolean;
  options: UpsertModifierOptionInput[];
}

function validateModifierGroupInput(input: UpsertModifierGroupInput): void {
  const fields: Record<string, string> = {};
  if (!input.name || !input.name.trim()) {
    fields.name = 'Укажите название группы модификаторов';
  }
  if (!input.options || input.options.length === 0) {
    fields.options = 'Добавьте хотя бы один вариант в группу';
  } else {
    for (const opt of input.options) {
      if (!opt.name || !opt.name.trim()) {
        fields.options = 'Укажите название для каждого варианта';
        break;
      }
      if (!Number.isInteger(opt.priceDelta) || opt.priceDelta < 0) {
        fields.options = 'Доплата должна быть целым числом >= 0';
        break;
      }
    }

    const defaultAvailableOptions = input.options.filter(
      (o) => o.isDefault && o.isAvailable
    );
    if (input.isRequired && defaultAvailableOptions.length === 0) {
      fields.options =
        'Обязательную группу без доступного варианта «по умолчанию» сохранить нельзя';
    }
    if (
      input.selectType === 'single' &&
      input.options.filter((o) => o.isDefault).length > 1
    ) {
      fields.options =
        'В группе с одиночным выбором может быть только один вариант по умолчанию';
    }
  }

  if (Object.keys(fields).length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', Object.values(fields)[0], fields);
  }
}

export async function createModifierGroup(
  input: UpsertModifierGroupInput
): Promise<AdminModifierGroupDto> {
  validateModifierGroupInput(input);

  const groupId = await transaction(async (tx) => {
    const ins = await tx.query<{ id: number }>(
      `INSERT INTO coffee_modifier_groups (name, select_type, is_required)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [input.name.trim(), input.selectType, input.isRequired]
    );
    const id = ins.rows[0].id;

    for (let i = 0; i < input.options.length; i++) {
      const opt = input.options[i];
      await tx.query(
        `INSERT INTO coffee_modifier_options (
           group_id, name, price_delta, is_available, is_default, sort_order
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          opt.name.trim(),
          opt.priceDelta,
          opt.isAvailable,
          opt.isDefault,
          opt.sortOrder ?? (i + 1) * 10,
        ]
      );
    }
    return id;
  });

  const groups = await listAdminModifierGroups();
  return groups.find((g) => g.id === groupId)!;
}

export async function updateModifierGroup(
  groupId: number,
  input: UpsertModifierGroupInput
): Promise<AdminModifierGroupDto> {
  validateModifierGroupInput(input);

  await transaction(async (tx) => {
    const existing = await tx.query<{ id: number }>(
      'SELECT id FROM coffee_modifier_groups WHERE id = $1',
      [groupId]
    );
    if (existing.rowCount === 0) {
      throw new AppError(404, 'MODIFIER_GROUP_NOT_FOUND', 'Группа модификаторов не найдена');
    }

    await tx.query(
      `UPDATE coffee_modifier_groups
       SET name = $1, select_type = $2, is_required = $3
       WHERE id = $4`,
      [input.name.trim(), input.selectType, input.isRequired, groupId]
    );

    const existingOpts = await tx.query<{ id: number }>(
      'SELECT id FROM coffee_modifier_options WHERE group_id = $1',
      [groupId]
    );
    const existingIds = new Set(existingOpts.rows.map((r) => r.id));
    const keptIds = new Set<number>();

    for (let i = 0; i < input.options.length; i++) {
      const opt = input.options[i];
      const sortOrder = opt.sortOrder ?? (i + 1) * 10;
      if (opt.id && existingIds.has(opt.id)) {
        keptIds.add(opt.id);
        await tx.query(
          `UPDATE coffee_modifier_options
           SET name = $1, price_delta = $2, is_available = $3, is_default = $4, sort_order = $5
           WHERE id = $6 AND group_id = $7`,
          [
            opt.name.trim(),
            opt.priceDelta,
            opt.isAvailable,
            opt.isDefault,
            sortOrder,
            opt.id,
            groupId,
          ]
        );
      } else {
        await tx.query(
          `INSERT INTO coffee_modifier_options (
             group_id, name, price_delta, is_available, is_default, sort_order
           )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            groupId,
            opt.name.trim(),
            opt.priceDelta,
            opt.isAvailable,
            opt.isDefault,
            sortOrder,
          ]
        );
      }
    }

    for (const oldId of existingIds) {
      if (!keptIds.has(oldId)) {
        await tx.query('DELETE FROM coffee_modifier_options WHERE id = $1', [oldId]);
      }
    }
  });

  const groups = await listAdminModifierGroups();
  return groups.find((g) => g.id === groupId)!;
}

export async function deleteModifierGroup(groupId: number): Promise<void> {
  const del = await query('DELETE FROM coffee_modifier_groups WHERE id = $1', [groupId]);
  if (del.rowCount === 0) {
    throw new AppError(404, 'MODIFIER_GROUP_NOT_FOUND', 'Группа модификаторов не найдена');
  }
}

const ALLOWED_IMAGE_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 МБ

export async function saveUploadedProductImage(file: File): Promise<string> {
  const ext = ALLOWED_IMAGE_MIME[file.type];
  if (!ext) {
    throw new AppError(
      400,
      'INVALID_IMAGE_TYPE',
      'Допустимы только изображения JPG, PNG или WebP'
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      400,
      'IMAGE_TOO_LARGE',
      'Размер изображения не должен превышать 5 МБ'
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new AppError(
      400,
      'IMAGE_TOO_LARGE',
      'Размер изображения не должен превышать 5 МБ'
    );
  }

  // Проверка сигнатуры файла (magic bytes) на сервере
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    throw new AppError(
      400,
      'INVALID_IMAGE_CONTENT',
      'Файл повреждён или не является изображением JPG, PNG или WebP'
    );
  }

  const cfg = getConfig();
  const uploadDir = path.resolve(process.cwd(), cfg.uploadDir);
  fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `${crypto.randomUUID()}${ext}`;
  const fullPath = path.join(uploadDir, fileName);
  fs.writeFileSync(fullPath, buffer);

  return `/api/coffee/images/${fileName}`;
}
