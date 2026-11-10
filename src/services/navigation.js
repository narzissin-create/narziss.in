const isObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const byOrder = (a, b) =>
  (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);

function normalizeItem(item, kind) {
  if (!isObject(item) || item.id === undefined || typeof item.name !== "string") {
    throw new Error(`Navigation ${kind} data is invalid.`);
  }

  const name = item.name.trim();
  const slug = typeof item.slug === "string" ? item.slug.trim() : "";
  if (!name || !slug) throw new Error(`Navigation ${kind} data is incomplete.`);

  return {
    id: item.id,
    name,
    slug,
    sort_order: Number(item.sort_order) || 0,
  };
}

export function normalizeNavigation(payload) {
  const rawSections = Array.isArray(payload) ? payload : payload?.sections;
  if (!Array.isArray(rawSections)) {
    throw new Error("Navigation data is unavailable.");
  }

  return rawSections
    .map((rawSection) => {
      const section = normalizeItem(rawSection, "section");
      const clothingType = rawSection.clothing_type;
      if (clothingType !== "upper" && clothingType !== "bottom") {
        throw new Error("Navigation section clothing type is invalid.");
      }
      const categories = Array.isArray(rawSection.categories)
        ? rawSection.categories.map((rawCategory) => ({
            ...normalizeItem(rawCategory, "category"),
            subcategories: Array.isArray(rawCategory.subcategories)
              ? rawCategory.subcategories
                  .map((item) => normalizeItem(item, "subcategory"))
                  .sort(byOrder)
              : [],
          }))
        : [];

      return {
        ...section,
        clothing_type: clothingType,
        categories: categories.sort(byOrder),
      };
    })
    .sort(byOrder);
}

const legacyBottomCategories = new Set([
  "trousers",
  "cargo",
  "pants",
  "bonkers-pants",
  "japanese-cut-pants",
]);

export function resolveProductClothingType(product, category, explicitSizes = []) {
  const storedType = product?.navigation?.section?.clothing_type || product?.clothing_type || product?.type;
  if (storedType === "upper" || storedType === "bottom") return storedType;
  if (legacyBottomCategories.has(String(category || "").toLowerCase())) return "bottom";
  return explicitSizes.length > 0 && explicitSizes.every((size) => /^\d+$/.test(String(size).trim()))
    ? "bottom"
    : "upper";
}
