import { TEMPORARY_HIERARCHY_IDS as ids } from "./temporaryStorefrontHierarchy.js";

// Explicit temporary assignments for real backend product IDs only.
// Product 3 (legacy category "test") is intentionally unassigned because its
// classification is ambiguous. Replace this map with backend assignments later.
export const TEMPORARY_PRODUCT_HIERARCHY_ASSIGNMENTS = Object.freeze({
  "2": Object.freeze({
    sectionId: ids.upperSection,
    categoryId: ids.shirtsCategory,
    subcategoryId: ids.plainShirtsSubcategory,
  }),
  "4": Object.freeze({
    sectionId: ids.upperSection,
    categoryId: ids.tshirtsCategory,
    subcategoryId: ids.acidWashSubcategory,
  }),
});

export const TEMPORARY_UNASSIGNED_PRODUCT_IDS = Object.freeze(["3"]);
