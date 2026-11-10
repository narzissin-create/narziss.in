import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveTemporaryHierarchyPath,
  TEMPORARY_HIERARCHY_IDS as ids,
} from "../src/services/temporaryStorefrontHierarchy.js";
import {
  applyTemporaryHierarchyAssignments,
  filterTemporaryHierarchyProducts,
} from "../src/services/temporaryHierarchyAdapter.js";

const products = [
  { id: "2", name: "Linen Shirt", price: 1499, tags: [], collections: [], category: "plain-shirts" },
  { id: "3", name: "Ambiguous", price: 1, tags: [], collections: [], category: "test" },
  { id: "4", name: "Acid Wash Tee", price: 3500, tags: ["Trending"], collections: [], category: "acid-wash-tees", isTrending: true },
];

test("resolves valid hierarchy paths and rejects invalid parent-child combinations", () => {
  const acidWash = resolveTemporaryHierarchyPath("men-upper-wear", "t-shirts", "acid-wash-tees");
  assert.equal(acidWash.valid, true);
  assert.equal(acidWash.subcategory.name, "Acid Wash Tees");
  assert.equal(resolveTemporaryHierarchyPath("men-upper-wear", "shirts", "acid-wash-tees").valid, false);
  assert.equal(resolveTemporaryHierarchyPath("men-bottom-wear", "shirts").valid, false);
});

test("maps only explicitly assigned real products without duplicates", () => {
  const assigned = applyTemporaryHierarchyAssignments([...products, products[0]]);
  assert.deepEqual(assigned.map((product) => product.id), ["2", "4"]);
  assert.equal(assigned.find((product) => product.id === "4").navigationCategoryId, ids.tshirtsCategory);
});

test("section, category, and subcategory filtering include the correct descendants", () => {
  assert.deepEqual(
    filterTemporaryHierarchyProducts(products, { sectionId: ids.upperSection }).map((product) => product.id),
    ["2", "4"],
  );
  assert.deepEqual(
    filterTemporaryHierarchyProducts(products, { sectionId: ids.upperSection, categoryId: ids.shirtsCategory }).map((product) => product.id),
    ["2"],
  );
  assert.deepEqual(
    filterTemporaryHierarchyProducts(products, { subcategoryId: ids.acidWashSubcategory }).map((product) => product.id),
    ["4"],
  );
});
