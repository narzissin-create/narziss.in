// Validate adapter data before it reaches render code. Keep this contract when
// replacing the demo adapter with backend requests.
export const isRecord = (v) =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && Boolean(v.trim());
export const validUser = (u) =>
  isRecord(u) &&
  text(u.id) &&
  text(u.email) &&
  (u.phone === undefined || typeof u.phone === "string");
export const validSavedAddress = (a) => validAddress(a) && text(a.id);
export const validCartLine = (v) =>
  isRecord(v) &&
  text(v.variantId) &&
  Number.isInteger(v.quantity) &&
  v.quantity > 0;
export const validCart = (v) =>
  Array.isArray(v) &&
  v.every(validCartLine) &&
  new Set(v.map((x) => x.variantId)).size === v.length;
export const validProduct = (p) =>
  isRecord(p) &&
  text(p.id) &&
  text(p.slug) &&
  text(p.name) &&
  Number.isFinite(p.price) &&
  p.price >= 0 &&
  ["upper", "bottom"].includes(p.type) &&
  typeof p.description === "string" &&
  Array.isArray(p.images) &&
  p.images.every((x) => typeof x === "string") &&
  Array.isArray(p.variants) &&
  p.variants.every(
    (v) =>
      isRecord(v) &&
      text(v.id) &&
      text(v.size) &&
      Number.isInteger(v.stock) &&
      v.stock >= 0,
  ) &&
  new Set(p.variants.map((v) => v.id)).size === p.variants.length;
export const validReview = (r) =>
  isRecord(r) &&
  text(r.id) &&
  text(r.userId) &&
  text(r.productId) &&
  typeof r.name === "string" &&
  typeof r.text === "string" &&
  Number.isInteger(r.rating) &&
  r.rating >= 1 &&
  r.rating <= 5;
export const validReviewPage = (r) =>
  isRecord(r) &&
  Array.isArray(r.items) &&
  r.items.every(validReview) &&
  Number.isInteger(r.total) &&
  r.total >= r.items.length &&
  (r.averageRating === null ||
    (Number.isFinite(r.averageRating) &&
      r.averageRating >= 1 &&
      r.averageRating <= 5));
export function addressErrors(a = {}) {
  const errors = {};
  for (const [key, label] of [
    ["name", "the recipient's full name"],
    ["line", "the delivery address"],
    ["city", "the city"],
    ["state", "the state"],
  ])
    if (!text(a?.[key])) errors[key] = `Enter ${label}.`;
  if (typeof a?.phone !== "string" || !/^[6-9]\d{9}$/.test(a.phone))
    errors.phone = "Enter a valid 10-digit Indian phone number.";
  if (typeof a?.pin !== "string" || !/^[1-9]\d{5}$/.test(a.pin))
    errors.pin = "Enter a valid 6-digit Indian PIN code.";
  if (a?.landmark != null && typeof a.landmark !== "string")
    errors.landmark = "Enter a valid landmark.";
  return errors;
}
export const validAddress = (a) =>
  isRecord(a) &&
  Object.keys(addressErrors(a)).length === 0 &&
  (a.id === undefined || text(a.id));
export const validOrder = (o) =>
  isRecord(o) &&
  text(o.id) &&
  text(o.userId) &&
  Number.isFinite(o.createdAt) &&
  validAddress(o.address) &&
  ["upi", "card", "cod"].includes(o.method) &&
  ["pending", "failed", "successful", "pay-on-delivery"].includes(
    o.paymentStatus,
  ) &&
  Array.isArray(o.items) &&
  o.items.length > 0 &&
  o.items.every(
    (l) =>
      validCartLine(l) &&
      Number.isFinite(l.price) &&
      l.price >= 0 &&
      ["processing", "shipped", "delivered", "cancelled"].includes(l.status) &&
      typeof l.canCancel === "boolean",
  ) &&
  (o.refundStatus == null || typeof o.refundStatus === "string");
export function expectData(value, validator, message) {
  if (!validator(value)) throw new Error(message);
  return value;
}
export const uniqueById = (items) => [
  ...new Map(items.map((item) => [item.id, item])).values(),
];

