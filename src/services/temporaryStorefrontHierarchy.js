// TEMPORARY STOREFRONT HIERARCHY
// Remove this file and swap its exported getter/resolver for the storefront
// navigation API once the backend exposes saved hierarchy data.
const ids = Object.freeze({
  upperSection: "temporary-section-upper",
  bottomSection: "temporary-section-bottom",
  tshirtsCategory: "temporary-category-t-shirts",
  shirtsCategory: "temporary-category-shirts",
  acidWashSubcategory: "temporary-subcategory-acid-wash-tees",
  printedShirtsSubcategory: "temporary-subcategory-printed-shirts",
  plainShirtsSubcategory: "temporary-subcategory-plain-shirts",
  trousersCategory: "temporary-category-trousers",
  cargoCategory: "temporary-category-cargo",
  pantsCategory: "temporary-category-pants",
  bonkersPantsCategory: "temporary-category-bonkers-pants",
  japaneseCutPantsCategory: "temporary-category-japanese-cut-pants",
});

const leafCategory = (id, sectionId, name, slug, sortOrder) => ({
  id,
  section_id: sectionId,
  name,
  slug,
  sort_order: sortOrder,
  subcategories: [],
});

export const TEMPORARY_STOREFRONT_HIERARCHY = Object.freeze([
  {
    id: ids.upperSection,
    name: "Men Upper Wear",
    slug: "men-upper-wear",
    clothing_type: "upper",
    sort_order: 0,
    categories: [
      {
        id: ids.tshirtsCategory,
        section_id: ids.upperSection,
        name: "T-Shirts",
        slug: "t-shirts",
        sort_order: 0,
        subcategories: [
          { id: ids.acidWashSubcategory, category_id: ids.tshirtsCategory, name: "Acid Wash Tees", slug: "acid-wash-tees", sort_order: 0 },
        ],
      },
      {
        id: ids.shirtsCategory,
        section_id: ids.upperSection,
        name: "Shirts",
        slug: "shirts",
        sort_order: 1,
        subcategories: [
          { id: ids.printedShirtsSubcategory, category_id: ids.shirtsCategory, name: "Printed Shirts", slug: "printed-shirts", sort_order: 0 },
          { id: ids.plainShirtsSubcategory, category_id: ids.shirtsCategory, name: "Plain Shirts", slug: "plain-shirts", sort_order: 1 },
        ],
      },
    ],
  },
  {
    id: ids.bottomSection,
    name: "Men Bottom Wear",
    slug: "men-bottom-wear",
    clothing_type: "bottom",
    sort_order: 1,
    categories: [
      leafCategory(ids.trousersCategory, ids.bottomSection, "Trousers", "trousers", 0),
      leafCategory(ids.cargoCategory, ids.bottomSection, "Cargo", "cargo", 1),
      leafCategory(ids.pantsCategory, ids.bottomSection, "Pants", "pants", 2),
      leafCategory(ids.bonkersPantsCategory, ids.bottomSection, "Bonkers Pants", "bonkers-pants", 3),
      leafCategory(ids.japaneseCutPantsCategory, ids.bottomSection, "Japanese-Cut Pants", "japanese-cut-pants", 4),
    ],
  },
]);

export const TEMPORARY_HIERARCHY_IDS = ids;

export function getTemporaryStorefrontHierarchy() {
  return TEMPORARY_STOREFRONT_HIERARCHY;
}

export function resolveTemporaryHierarchyPath(sectionSlug, categorySlug, subcategorySlug) {
  const section = TEMPORARY_STOREFRONT_HIERARCHY.find((item) => item.slug === sectionSlug);
  const category = categorySlug
    ? section?.categories.find((item) => item.slug === categorySlug)
    : undefined;
  const subcategory = subcategorySlug
    ? category?.subcategories.find((item) => item.slug === subcategorySlug)
    : undefined;
  const valid = Boolean(
    section &&
    (!categorySlug || category) &&
    (!subcategorySlug || subcategory),
  );
  return { valid, section, category, subcategory };
}
