import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDevelopmentSubcategoryFixtures,
  getDevelopmentFixtureProductBySlug,
  getDevelopmentFixtureProducts,
  resolveDevelopmentShopPath,
} from "../src/services/developmentSubcategoryFixtures.js";

const navigation = [
  { id: "upper", name: "Men Upper Wear", slug: "men-upper-wear", categories: [{ id: "plain", name: "Plain Shirts", slug: "plain-shirts", subcategories: [] }] },
  { id: "bottom", name: "Men Bottom Wear", slug: "men-bottom-wear", categories: [{ id: "trousers", name: "Trousers", slug: "trousers", subcategories: [] }] },
];

test("development subcategories are isolated under Plain Shirts and Trousers", () => {
  const result = applyDevelopmentSubcategoryFixtures(navigation);
  assert.deepEqual(result[0].categories[0].subcategories.map((item) => item.name), ["Test Subcategory 1", "Test Subcategory 2"]);
  assert.deepEqual(result[1].categories[0].subcategories.map((item) => item.name), ["Test Subcategory 1", "Test Subcategory 2"]);
  assert.deepEqual(navigation[0].categories[0].subcategories, []);
});

test("development route resolution validates the complete parent chain", () => {
  const result = applyDevelopmentSubcategoryFixtures(navigation);
  assert.equal(resolveDevelopmentShopPath(result, "men-upper-wear", "plain-shirts", "test-subcategory-1")?.subcategory.name, "Test Subcategory 1");
  assert.equal(resolveDevelopmentShopPath(result, "men-bottom-wear", "trousers", "test-subcategory-2")?.subcategory.name, "Test Subcategory 2");
  assert.equal(resolveDevelopmentShopPath(result, "men-upper-wear", "trousers", "test-subcategory-1"), null);
});

test("mock products stay within their explicit development subcategory assignments", () => {
  const plainOne = getDevelopmentFixtureProducts("men-upper-wear", "plain-shirts", "test-subcategory-1");
  const trousersTwo = getDevelopmentFixtureProducts("men-bottom-wear", "trousers", "test-subcategory-2");
  assert.equal(plainOne.length, 31);
  assert.equal(trousersTwo.length, 31);
  assert.ok(plainOne.every((product) => product.id.startsWith("dev-plain-1")));
  assert.ok(trousersTwo.every((product) => product.id.startsWith("dev-trousers-2")));
  assert.deepEqual(getDevelopmentFixtureProducts("men-upper-wear", "trousers", "test-subcategory-1"), []);
  const detailProduct = getDevelopmentFixtureProductBySlug("development-dev-plain-1-01");
  assert.equal(detailProduct.slug, "development-dev-plain-1-01");
  assert.equal(detailProduct.isDevelopmentFixture, true);
  assert.equal(detailProduct.images.length, 3);
  assert.ok(detailProduct.variants.every((variant) => variant.stock === 0));
});
