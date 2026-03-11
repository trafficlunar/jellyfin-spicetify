export function signal<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set: (v: T) => {
      value = v;
      listeners.forEach((l) => l(v));
    },
    subscribe: (l: (v: T) => void) => listeners.add(l),
  };
}
