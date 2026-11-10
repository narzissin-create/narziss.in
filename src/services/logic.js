export function addLine(cart, variant, quantity = 1, max = 3) {
  const existing = cart.find((l) => l.variantId === variant.id);
  const limit = Math.min(max, variant.stock);
  if ((existing?.quantity || 0) + quantity > limit)
    throw new Error("Maximum available quantity reached.");
  if (quantity < 1 || !Number.isInteger(quantity))
    throw new Error("Invalid quantity.");
  return existing
    ? cart.map((l) =>
        l.variantId === variant.id
          ? { ...l, quantity: l.quantity + quantity }
          : l,
      )
    : [...cart, { variantId: variant.id, quantity }];
}
export const STANDARD_COUPONS = {
  FIRST10: { code: "FIRST10", discountPercent: 10, minOrderValue: 0, description: "10% off your entire order" },
  NARZISS500: { code: "NARZISS500", flatDiscount: 500, minOrderValue: 2500, description: "₹500 off on orders above ₹2,500" },
};

export function validateCoupon(rawCode, subtotal = 0) {
  if (!rawCode || typeof rawCode !== "string") {
    return { valid: false, message: "Please enter a valid coupon code." };
  }
  const code = rawCode.trim().toUpperCase();
  const promo = STANDARD_COUPONS[code];
  if (!promo) {
    return { valid: false, message: `Coupon "${code}" is invalid or expired.` };
  }
  if (promo.minOrderValue && subtotal < promo.minOrderValue) {
    return {
      valid: false,
      message: `Coupon "${code}" requires a minimum order of ₹${promo.minOrderValue.toLocaleString("en-IN")}.`,
    };
  }

  let discount = 0;
  if (promo.discountPercent) {
    discount = Math.round((subtotal * promo.discountPercent) / 100);
  } else if (promo.flatDiscount) {
    discount = Math.min(promo.flatDiscount, subtotal);
  }

  return {
    valid: true,
    code,
    discount,
    description: promo.description,
  };
}

export function totals(lines, settings, coupon = null) {
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);

  // Dynamic Free Shipping threshold (complimentary above ₹1,999)
  const freeShippingThreshold = settings?.freeShippingThreshold ?? 1999;
  let shipping = 0;
  if (lines.length > 0) {
    if (settings?.shipping > 0) {
      shipping = subtotal >= freeShippingThreshold ? 0 : settings.shipping;
    } else {
      shipping = 0;
    }
  }

  // Calculate coupon discount
  let discount = 0;
  let appliedCoupon = null;
  if (coupon) {
    if (typeof coupon === "object" && coupon && coupon.valid) {
      appliedCoupon = coupon;
      // If coupon object has percentage or flat rules, recalculate against current subtotal
      if (coupon.discount_percent && coupon.discount_percent > 0) {
        discount = Math.round((subtotal * coupon.discount_percent) / 100);
        if (coupon.max_discount_cap && coupon.max_discount_cap > 0) {
          discount = Math.min(discount, coupon.max_discount_cap);
        }
      } else if (coupon.flat_discount && coupon.flat_discount > 0) {
        discount = Math.min(coupon.flat_discount, subtotal);
      } else if (coupon.discount && coupon.discount > 0) {
        discount = Math.min(coupon.discount, subtotal);
      }
    } else if (typeof coupon === "string") {
      const val = validateCoupon(coupon, subtotal);
      if (val && val.valid) {
        discount = val.discount;
        appliedCoupon = val;
      }
    }
  }

  const taxableSubtotal = Math.max(0, subtotal - discount);

  const gst = settings?.pricesIncludeGst
    ? taxableSubtotal - taxableSubtotal / (1 + (settings?.gstPercent || 0) / 100)
    : (taxableSubtotal * (settings?.gstPercent || 0)) / 100;

  const total = taxableSubtotal + shipping + (settings?.pricesIncludeGst ? 0 : gst);

  const amountToFreeShipping = Math.max(0, freeShippingThreshold - subtotal);

  return {
    subtotal,
    discount,
    appliedCoupon,
    shipping,
    gst,
    total,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    freeShippingThreshold,
    amountToFreeShipping,
    qualifiesForFreeShipping: subtotal >= freeShippingThreshold,
  };
}
export function filterProducts(items, f = {}) {
  return items
    .filter(
      (p) =>
        (!f.category || p.category === f.category) &&
        (!f.collection ||
          (f.collection === "trending"
            ? p.isTrending
            : p.collections.includes(f.collection))) &&
        (!f.tab ||
          f.tab === "all" ||
          (f.tab === "new" ? p.isNew : p.isTrending)) &&
        (!f.type || p.type === f.type) &&
        (!f.material || p.material === f.material) &&
        (!f.colour || p.colour === f.colour) &&
        (!f.tag ||
          (Array.isArray(p.tags) &&
            p.tags.some((t) => t.toLowerCase() === f.tag.toLowerCase())) ||
          p.category?.toLowerCase() === f.tag.toLowerCase()) &&
        (!f.categoryId || String(p.navigationCategoryId) === String(f.categoryId)) &&
        (!f.subcategoryId || String(p.navigationSubcategoryId) === String(f.subcategoryId)) &&
        (!f.maxPrice || p.price <= f.maxPrice) &&
        (!f.minPrice || p.price >= f.minPrice) &&
        (!f.ids || f.ids.map(String).includes(String(p.id))) &&
        (!f.query ||
          `${p.name} ${p.category?.replaceAll("-", " ") || ""} ${(p.tags || []).join(" ")}`
            .toLowerCase()
            .includes(f.query.toLowerCase())),
    )
    .sort((a, b) =>
      f.sort === "asc"
        ? a.price - b.price
        : f.sort === "desc"
          ? b.price - a.price
          : 0,
    );
}

export function rankRelatedProducts(items, current, limit = 10) {
  const currentTags = new Set(
    (Array.isArray(current?.tags) ? current.tags : []).map((tag) => String(tag).toLowerCase()),
  );
  const seen = new Set();
  const cappedLimit = Math.min(10, Math.max(0, Number(limit) || 0));
  const stableHash = (value) => [...String(value)].reduce(
    (number, character) => (number * 31 + character.charCodeAt(0)) >>> 0,
    17,
  );
  const score = (product) => {
    let value = 0;
    if (current?.category && product.category === current.category) value += 100;
    if (current?.type && product.type === current.type) value += 10;
    const productTags = Array.isArray(product.tags) ? product.tags : [];
    value += productTags.reduce(
      (total, tag) => total + (currentTags.has(String(tag).toLowerCase()) ? 20 : 0),
      0,
    );
    return value;
  };

  return (Array.isArray(items) ? items : [])
    .filter((product) => {
      if (!product || product.id === current?.id || product.slug === current?.slug) return false;
      const key = String(product.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) =>
      score(right) - score(left) ||
      stableHash(`${current?.id || "product"}:${left.id}`) -
        stableHash(`${current?.id || "product"}:${right.id}`) ||
      String(left.id).localeCompare(String(right.id)),
    )
    .slice(0, cappedLimit);
}
export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
