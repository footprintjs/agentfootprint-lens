/** One owner for the supported pause homes. Return the original request, not a filtered copy. */
export function awaitingInputOf(value: unknown): Readonly<Record<string, unknown>> | undefined {
  try {
    for (let depth = 0; depth < 5; depth++) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const own = (key: string): unknown => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
      };
      if (Array.isArray(own('fields'))) return value as Readonly<Record<string, unknown>>;
      value = own('awaitingInput') ?? own('pauseData');
    }
    return undefined;
  } catch { return undefined; }
}
