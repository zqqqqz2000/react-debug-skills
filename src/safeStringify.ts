type Serializable =
  | string
  | number
  | boolean
  | null
  | Serializable[]
  | { [key: string]: Serializable };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toSerializable(value: unknown, path: string, seen: WeakMap<object, string>): Serializable {
  const valueType = typeof value;

  if (valueType === "string") {
    return value as string;
  }
  if (valueType === "number") {
    const n = value as number;
    if (Number.isFinite(n)) {
      return n;
    }
    return `[NonFiniteNumber:${String(n)}]`;
  }
  if (valueType === "boolean") {
    return value as boolean;
  }
  if (valueType === "undefined") {
    return "[Undefined]";
  }
  if (valueType === "bigint") {
    return `[BigInt:${String(value)}]`;
  }
  if (valueType === "symbol") {
    return `[Symbol:${String(value)}]`;
  }
  if (valueType === "function") {
    const fn = value as (...args: never[]) => unknown;
    return `[Function:${fn.name || "anonymous"}]`;
  }
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    return `[Unserializable:${Object.prototype.toString.call(value)}]`;
  }

  if (seen.has(value)) {
    return `[Circular->${seen.get(value)}]`;
  }

  seen.set(value, path);

  if (Array.isArray(value)) {
    const arr: Serializable[] = [];
    for (let index = 0; index < value.length; index += 1) {
      arr.push(toSerializable(value[index], `${path}[${index}]`, seen));
    }
    return arr;
  }

  if (value instanceof Date) {
    return `[Date:${value.toISOString()}]`;
  }

  if (value instanceof RegExp) {
    return `[RegExp:${String(value)}]`;
  }

  if (value instanceof Set) {
    const items: Serializable[] = [];
    let index = 0;
    for (const entry of value.values()) {
      items.push(toSerializable(entry, `${path}.set[${index}]`, seen));
      index += 1;
    }
    return items;
  }

  if (value instanceof Map) {
    const mapOutput: { [key: string]: Serializable } = {};
    let index = 0;
    for (const [mapKey, mapValue] of value.entries()) {
      const keyString = typeof mapKey === "string" ? mapKey : `[Key:${String(mapKey)}]`;
      mapOutput[keyString] = toSerializable(mapValue, `${path}.map[${index}]`, seen);
      index += 1;
    }
    return mapOutput;
  }

  const output: { [key: string]: Serializable } = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    output[key] = toSerializable(value[key], `${path}.${key}`, seen);
  }

  return output;
}

export function safeStringify(value: unknown): string {
  const serializable = toSerializable(value, "$", new WeakMap<object, string>());
  return JSON.stringify(serializable, null, 2);
}
