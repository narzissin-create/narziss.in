// Development-only visual fixture. StoreHeader uses this only when Vite is in
// development mode and the real navigation API is unavailable. It is never
// submitted or persisted.
export const developmentNavigationPreview = [
  {
    id: "preview-upper",
    name: "Men Upper Wear",
    slug: "men-upper-wear",
    clothing_type: "upper",
    sort_order: 0,
    categories: [
      { id: "preview-acid-wash", name: "Acid Wash Tees", slug: "acid-wash-tees", sort_order: 0, subcategories: [] },
      { id: "preview-printed", name: "Printed Shirts", slug: "printed-shirts", sort_order: 1, subcategories: [] },
      { id: "preview-plain", name: "Plain Shirts", slug: "plain-shirts", sort_order: 2, subcategories: [] },
    ],
  },
  {
    id: "preview-bottom",
    name: "Men Bottom Wear",
    slug: "men-bottom-wear",
    clothing_type: "bottom",
    sort_order: 1,
    categories: [
      { id: "preview-trousers", name: "Trousers", slug: "trousers", sort_order: 0, subcategories: [] },
      { id: "preview-cargo", name: "Cargo", slug: "cargo", sort_order: 1, subcategories: [] },
      { id: "preview-pants", name: "Pants", slug: "pants", sort_order: 2, subcategories: [] },
      { id: "preview-bonkers", name: "Bonkers Pants", slug: "bonkers-pants", sort_order: 3, subcategories: [] },
      { id: "preview-japanese", name: "Japanese-Cut Pants", slug: "japanese-cut-pants", sort_order: 4, subcategories: [] },
    ],
  },
];
