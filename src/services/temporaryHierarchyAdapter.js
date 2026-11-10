import { api } from "./api.js";
import { filterProducts } from "./logic.js";
import { TEMPORARY_PRODUCT_HIERARCHY_ASSIGNMENTS } from "./temporaryProductHierarchyMap.js";

const API_PAGE_SIZE = 100;
const MAX_API_PAGES = 100;

export function applyTemporaryHierarchyAssignments(products) {
  const seen = new Set();
  return (Array.isArray(products) ? products : []).flatMap((product) => {
    const key = String(product?.id ?? "");
    const assignment = TEMPORARY_PRODUCT_HIERARCHY_ASSIGNMENTS[key];
    if (!product || !assignment || seen.has(key)) return [];
    seen.add(key);
    return [{
      ...product,
      navigationSectionId: assignment.sectionId,
      navigationCategoryId: assignment.categoryId,
      navigationSubcategoryId: assignment.subcategoryId ?? null,
      hasHierarchyAssignment: true,
    }];
  });
}

export function filterTemporaryHierarchyProducts(products, filters = {}) {
  const assigned = applyTemporaryHierarchyAssignments(products).filter((product) =>
    (!filters.sectionId || String(product.navigationSectionId) === String(filters.sectionId)) &&
    (!filters.categoryId || String(product.navigationCategoryId) === String(filters.categoryId)) &&
    (!filters.subcategoryId || String(product.navigationSubcategoryId) === String(filters.subcategoryId)),
  );
  const { sectionId: _sectionId, ...existingFilters } = filters;
  return filterProducts(assigned, existingFilters);
}

async function loadCompleteRealProductCollection(options = {}) {
  const products = [];
  const seen = new Set();
  let offset = 0;
  let total = Infinity;
  let page = 0;

  while (offset < total && page < MAX_API_PAGES) {
    const result = await api.listProducts({}, offset, API_PAGE_SIZE, options);
    if (!result || !Array.isArray(result.items) || !Number.isFinite(result.total)) {
      throw new Error("The complete product catalogue could not be read.");
    }
    total = result.total;
    result.items.forEach((product) => {
      const key = String(product.id);
      if (!seen.has(key)) {
        seen.add(key);
        products.push(product);
      }
    });
    offset += result.items.length;
    page += 1;
    if (!result.items.length) break;
  }

  if (offset < total) {
    throw new Error("The complete product catalogue could not be loaded for hierarchy filtering.");
  }
  return products;
}

export async function listTemporaryHierarchyProducts(filters = {}, offset = 0, limit = 15, options = {}) {
  const allProducts = await loadCompleteRealProductCollection(options);
  const filtered = filterTemporaryHierarchyProducts(allProducts, filters);
  return {
    items: filtered.slice(offset, offset + limit),
    total: filtered.length,
  };
}
