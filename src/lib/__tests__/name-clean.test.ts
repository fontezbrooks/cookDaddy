import { nameClean } from '@/lib/name-clean';

describe('nameClean', () => {
  it('normalizes case and singularizes the last word', () => {
    expect(nameClean('Olive Oil')).toBe('olive oil');
    expect(nameClean('olive oil')).toBe('olive oil');
    expect(nameClean('Olive Oils')).toBe('olive oil');
  });

  it('trims whitespace and handles es plurals', () => {
    expect(nameClean('  Tomatoes ')).toBe('tomato');
  });

  it('does not strip ss endings', () => {
    expect(nameClean('Glass')).toBe('glass');
  });

  it('normalizes empty and whitespace names to an empty string', () => {
    expect(nameClean('')).toBe('');
    expect(nameClean('   ')).toBe('');
  });

  it('collapses internal whitespace and strips surrounding punctuation', () => {
    expect(nameClean('...  Cherry   Tomatoes!!!')).toBe('cherry tomato');
  });
});
