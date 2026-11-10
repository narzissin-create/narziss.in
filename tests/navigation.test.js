import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNavigation, resolveProductClothingType } from "../src/services/navigation.js";

test("normalizes and orders the nested navigation contract", () => {
  const result = normalizeNavigation({
    sections: [
      {
        id: 2,
        name: " Men Bottom Wear ",
        slug: "men-bottom-wear",
        clothing_type: "bottom",
        sort_order: 2,
        categories: [],
      },
      {
        id: 1,
        name: "Men Upper Wear",
        slug: "men-upper-wear",
        clothing_type: "upper",
        sort_order: 1,
        categories: [{
          id: 10,
          name: "Shirts",
          slug: "shirts",
          sort_order: 0,
          subcategories: [{ id: 100, name: "Plain Shirts", slug: "plain-shirts", sort_order: 0 }],
        }],
      },
    ],
  });

  assert.equal(result[0].name, "Men Upper Wear");
  assert.equal(result[0].categories[0].subcategories[0].slug, "plain-shirts");
  assert.equal(result[1].clothing_type, "bottom");
});

test("rejects missing clothing type instead of guessing from a name", () => {
  assert.throws(() => normalizeNavigation({
    sections: [{ id: 1, name: "Upper", slug: "upper", categories: [] }],
  }), /clothing type/i);
});

test("supports legacy products while preferring stored navigation clothing type", () => {
  assert.equal(resolveProductClothingType({}, "cargo", ["M", "L"]), "bottom");
  assert.equal(resolveProductClothingType({}, "test", ["M", "L", "XL"]), "upper");
  assert.equal(resolveProductClothingType({}, "legacy", ["30", "32"]), "bottom");
  assert.equal(
    resolveProductClothingType({ navigation: { section: { clothing_type: "upper" } } }, "cargo", ["30"]),
    "upper",
  );
});
