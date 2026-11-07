import { describe, expect, it } from 'vitest';
import { formatMoney, fractionDigits, isValidCurrency, minorToEditable, minorToInput, parseMoney } from './money';

describe('Naira', () => {
  it('shows the ₦ symbol and hides .00 on whole amounts', () => {
    expect(formatMoney(150000, 'NGN')).toContain('₦');
    expect(formatMoney(150000, 'NGN')).not.toContain('NGN');
    expect(formatMoney(150000, 'NGN').replace(/\D/g, '')).toBe('1500');
  });

  it('still shows kobo when there are any', () => {
    expect(formatMoney(150050, 'NGN').replace(/[^\d.]/g, '')).toBe('1500.50');
  });

  it('reads typed amounts and fills edit fields cleanly', () => {
    expect(parseMoney('1,500', 2)).toBe(150000);
    expect(parseMoney('1500', 2)).toBe(150000);
    expect(minorToEditable(150000, 2)).toBe('1500');
    expect(minorToEditable(150050, 2)).toBe('1500.50');
  });
});

describe('parseMoney', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['12,50', 1250],
    ['.5', 50],
    ['0', 0],
    ['1,500', 150000],
    ['1.500', 150000],
    ['1,000,000', 100000000],
    ['1,500.75', 150075],
    ['1.500,75', 150075],
    [' 8 ', 800],
  ])('reads %s with two decimals', (text, minor) => {
    expect(parseMoney(text, 2)).toBe(minor);
  });

  it.each(['', 'abc', '-5', '12.5555', '1.000,50,25', '12a'])('rejects %j', (text) => {
    expect(parseMoney(text, 2)).toBeNull();
  });

  it('handles currencies with no decimals', () => {
    expect(parseMoney('1500', 0)).toBe(1500);
    expect(parseMoney('1,500', 0)).toBe(1500);
    expect(parseMoney('12.5', 0)).toBeNull();
  });

  it('round-trips through the input format without rounding errors', () => {
    for (const minor of [0, 1, 29, 1999, 123456]) {
      expect(parseMoney(minorToInput(minor, 2), 2)).toBe(minor);
    }
  });
});

describe('currency helpers', () => {
  it('knows decimal places', () => {
    expect(fractionDigits('USD')).toBe(2);
    expect(fractionDigits('CLP')).toBe(0);
  });

  it('validates codes', () => {
    expect(isValidCurrency('NGN')).toBe(true);
    expect(isValidCurrency('nope')).toBe(false);
  });
});
