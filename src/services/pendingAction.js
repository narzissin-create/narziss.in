export function createPendingAction() {
  let action = null;
  return {
    set(next) {
      action = typeof next === "function" ? next : null;
    },
    clear() {
      action = null;
    },
    async run() {
      const next = action;
      action = null;
      if (next) await next();
    },
  };
}
