export const NEW_ARRIVALS_PATH = "/#new-arrivals";

export function replaceBroadShopDestination(destination) {
  if (typeof destination !== "string") return destination;
  const trimmed = destination.trim();
  return /^\/shop(?:[?#].*)?$/.test(trimmed) ? NEW_ARRIVALS_PATH : destination;
}
