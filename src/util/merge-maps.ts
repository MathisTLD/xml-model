export default function mergeMaps<K, V>(...sources: Map<K, V>[]): Map<K, V> {
  const res = new Map<K, V>();
  sources.forEach((source) => {
    const overrides = new Map<K, V>();
    const additions = new Map<K, V>();
    source.forEach((val, key) => (res.has(key) ? overrides : additions).set(key, val));
    if (overrides.size) {
      const entries = Array.from(res.entries());
      entries.forEach((entry) => {
        const key = entry[0];
        if (overrides.has(key)) entry[1] = overrides.get(key) as V;
      });
      res.clear();
      entries.forEach(([key, val]) => res.set(key, val));
    }
    additions.forEach((val, key) => res.set(key, val));
  });
  return res;
}
