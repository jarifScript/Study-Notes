const orderedListStyles: Record<string, string> = {
  '1': 'decimal',
  a: 'lower-alpha',
  A: 'upper-alpha',
  i: 'lower-roman',
  I: 'upper-roman',
}

export function orderedListStyleForType(type: string | null): string | null {
  return type ? orderedListStyles[type] ?? null : null
}
