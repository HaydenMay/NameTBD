// Fills {merchant} {comp_a} {comp_b} {indep} (cast keys) and extra {name} values in authored text.
export function fill(text, state, extra = {}) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => {
    if (k in extra) return extra[k];
    const id = state.cast[k];
    return id && state.characters[id] ? state.characters[id].name : m;
  });
}
