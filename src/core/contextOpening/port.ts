/** Shape only: never invokes the producer resolver or a property getter. */
export function isDecodedContextPort(value: unknown): boolean {
  try {
    return value !== null && typeof value === 'object' &&
      Object.getOwnPropertyDescriptor(value, 'calls') !== undefined &&
      Object.getOwnPropertyDescriptor(value, 'recording') !== undefined;
  } catch { return false; }
}
