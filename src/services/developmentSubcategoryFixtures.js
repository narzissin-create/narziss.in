// Development-only navigation fixtures. Remove this file and its two imports
// when backend-managed subcategories are available. Nothing here is persisted.
export const DEVELOPMENT_SUBCATEGORY_FIXTURES = [
  {
    sectionSlug: "men-upper-wear",
    categorySlug: "plain-shirts",
    subcategories: [
      { id: "dev-plain-test-1", name: "Test Subcategory 1", slug: "test-subcategory-1", sort_order: 0 },
      { id: "dev-plain-test-2", name: "Test Subcategory 2", slug: "test-subcategory-2", sort_order: 1 },
    ],
  },
  {
    sectionSlug: "men-bottom-wear",
    categorySlug: "trousers",
    subcategories: [
      { id: "dev-trousers-test-1", name: "Test Subcategory 1", slug: "test-subcategory-1", sort_order: 0 },
      { id: "dev-trousers-test-2", name: "Test Subcategory 2", slug: "test-subcategory-2", sort_order: 1 },
    ],
  },
];

const mockImage = (label, background, foreground = "#f5e6cc") =>
  `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000">
      <rect width="800" height="1000" fill="${background}"/>
      <path d="M245 230 330 170h140l85 60 105 115-78 72-60-58v390H278V359l-60 58-78-72Z" fill="${foreground}" opacity=".88"/>
      <text x="400" y="870" text-anchor="middle" fill="${foreground}" font-family="Arial" font-size="34" letter-spacing="5">${label}</text>
      <text x="400" y="920" text-anchor="middle" fill="${foreground}" font-family="Arial" font-size="20" letter-spacing="3">DEVELOPMENT FIXTURE</text>
    </svg>`)}`;

const MOCK_PRODUCT_GROUPS = [
  { key: "plain-1", label: "PLAIN 1", name: "Mock Plain Shirt 1", sectionSlug: "men-upper-wear", categorySlug: "plain-shirts", subcategorySlug: "test-subcategory-1", basePrice: 1000, colours: ["#68704b", "#8a7159"] },
  { key: "plain-2", label: "PLAIN 2", name: "Mock Plain Shirt 2", sectionSlug: "men-upper-wear", categorySlug: "plain-shirts", subcategorySlug: "test-subcategory-2", basePrice: 2000, colours: ["#58636b", "#7b5e57"] },
  { key: "trousers-1", label: "TROUSER 1", name: "Mock Trouser 1", sectionSlug: "men-bottom-wear", categorySlug: "trousers", subcategorySlug: "test-subcategory-1", basePrice: 3000, colours: ["#3f4c43", "#766b57"] },
  { key: "trousers-2", label: "TROUSER 2", name: "Mock Trouser 2", sectionSlug: "men-bottom-wear", categorySlug: "trousers", subcategorySlug: "test-subcategory-2", basePrice: 4000, colours: ["#50545f", "#69584b"] },
];

export const DEVELOPMENT_MOCK_PRODUCTS = MOCK_PRODUCT_GROUPS.flatMap((group) =>
  Array.from({ length: 31 }, (_, index) => {
    const number = index + 1;
    const suffix = String(number).padStart(2, "0");
    return {
      id: `dev-${group.key}-${suffix}`,
      name: `${group.name} ${suffix}`,
      sectionSlug: group.sectionSlug,
      categorySlug: group.categorySlug,
      subcategorySlug: group.subcategorySlug,
      tagSlot: index % 2,
      isTrending: index % 3 === 0,
      price: group.basePrice + number * 35,
      image: mockImage(`${group.label}-${suffix}`, group.colours[index % group.colours.length]),
    };
  }),
);

export function getDevelopmentFixtureProductBySlug(slug) {
  const product = DEVELOPMENT_MOCK_PRODUCTS.find((item) => `development-${item.id}` === slug);
  if (!product) return null;
  const type = product.sectionSlug === "men-bottom-wear" ? "bottom" : "upper";
  return {
    ...product,
    slug: `development-${product.id}`,
    previewQuery: "?navigationPreview=fixtures",
    description: "Development-only product used to verify the existing Narziss product-detail route and gallery.",
    material: "Development fixture",
    colour: "Fixture",
    type,
    isDevelopmentFixture: true,
    isTrending: product.isTrending,
    images: [product.image, product.image, product.image],
    variants: ["M", "L", "XL"].map((size, index) => ({ id: `${product.id}-${size}-${index}`, size, stock: 0 })),
  };
}

export function getDevelopmentFixtureProducts(sectionSlug, categorySlug, subcategorySlug) {
  return DEVELOPMENT_MOCK_PRODUCTS.filter((product) =>
    product.sectionSlug === sectionSlug &&
    (!categorySlug || product.categorySlug === categorySlug) &&
    (!subcategorySlug || product.subcategorySlug === subcategorySlug),
  );
}

export function applyDevelopmentSubcategoryFixtures(sections) {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => ({
    ...section,
    categories: (section.categories || []).map((category) => {
      const fixture = DEVELOPMENT_SUBCATEGORY_FIXTURES.find(
        (item) => item.sectionSlug === section.slug && item.categorySlug === category.slug,
      );
      return fixture
        ? { ...category, subcategories: fixture.subcategories.map((item) => ({ ...item })) }
        : { ...category, subcategories: [...(category.subcategories || [])] };
    }),
  }));
}

export function resolveDevelopmentShopPath(sections, sectionSlug, categorySlug, subcategorySlug) {
  const section = sections.find((item) => item.slug === sectionSlug);
  if (!section) return null;
  if (!categorySlug) return { section, category: null, subcategory: null };
  const category = section?.categories.find((item) => item.slug === categorySlug);
  if (!category) return null;
  if (!subcategorySlug) return { section, category, subcategory: null };
  const subcategory = category?.subcategories.find((item) => item.slug === subcategorySlug);
  return subcategory ? { section, category, subcategory } : null;
}
