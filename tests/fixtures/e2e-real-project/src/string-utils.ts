export function capitalize(value: string): string {
  if (value.length === 0) return "";
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function reverse(value: string): string {
  return value.split("").reverse().join("");
}
