import { categories, materials, colours } from "../config.js";

export const products = categories.flatMap((category, c) =>
  Array.from({ length: 18 }, (_, i) => {
    const sizes =
      category.type === "upper"
        ? ["S", "M", "L", "XL", "XXL", "3XL"]
        : ["28", "30", "32", "34", "36", "38"];
    return {
      id: `p-${c}-${i}`,
      slug: `${category.slug}-${i + 1}`,
      name: `${["Essential", "Relaxed", "Signature", "Artisanal"][i % 4]} ${category.name} ${i + 1}`,
      category: category.slug,
      type: category.type,
      price: 899 + c * 150 + i * 50,
      material: materials[category.type][i % 5],
      colour: colours[i % 8],
      isNew: i < 3,
      isTrending: i % 3 === 0,
      collections: i % 2 ? ["casual"] : ["formal", "casual"],
      images: ["/assets/hero.png"],
      description: `Premium quality ${category.name.toLowerCase()} designed by Narziss. Tailored with care using breathable ${materials[category.type][i % 5]} with reinforced stitching.`,
      rating: 4.8,
      reviewCount: 12 + (i % 10) * 3,
      variants: sizes.map((size) => ({
        id: `v-${c}-${i}-${size}`,
        size,
        stock:
          i === 17
            ? 0
            : (category.type === "upper"
                  ? ["M", "L", "XL"]
                  : ["28", "30", "32"]
                ).includes(size)
              ? i % 5 === 0
                ? 2
                : 8
              : 0,
      })),
    };
  }),
);

const productIndex = new Map();
const variantIndex = new Map();

for (const product of products) {
  productIndex.set(product.id, product);
  productIndex.set(product.slug, product);
  for (const variant of product.variants)
    variantIndex.set(variant.id, { ...variant, product });
}

export const registerDynamicProduct = (product) => {
  productIndex.set(product.id, product);
  productIndex.set(product.slug, product);
  if (Array.isArray(product.variants)) {
    for (const variant of product.variants) {
      variantIndex.set(variant.id, { ...variant, product });
    }
  }
};

export const findProduct = (id) => productIndex.get(id);
export const findVariant = (id) => variantIndex.get(id);
