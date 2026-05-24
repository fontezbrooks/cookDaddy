function singularizeLastWord(value: string): string {
  const words = value.split(' ');
  const last = words.at(-1) ?? '';
  const singular = last.replace(/(s|x|z|ch|sh|o)es$/, '$1').replace(/(?<!s)s$/, '');

  return [...words.slice(0, -1), singular].join(' ');
}

export function nameClean(name: string): string {
  const cleaned = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

  return cleaned ? singularizeLastWord(cleaned) : '';
}
