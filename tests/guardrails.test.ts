import { describe, it, expect } from 'vitest';
import { checkGuardrails } from '../lib/guardrails';

describe('checkGuardrails', () => {
  it('allows a plain SELECT', () => {
    const result = checkGuardrails('SELECT * FROM customers', false);
    expect(result.allowed).toBe(true);
  });

  it('blocks DROP TABLE regardless of write mode', () => {
    const result = checkGuardrails('DROP TABLE customers', true);
    expect(result.allowed).toBe(false);
    expect(result.severity).toBe('blocked');
  });

  it('blocks TRUNCATE', () => {
    const result = checkGuardrails('TRUNCATE TABLE orders', true);
    expect(result.allowed).toBe(false);
  });

  it('blocks writes when allowWrites is false', () => {
    const result = checkGuardrails("INSERT INTO customers (full_name) VALUES ('x')", false);
    expect(result.allowed).toBe(false);
  });

  it('allows writes when allowWrites is true and a WHERE clause exists for UPDATE', () => {
    const result = checkGuardrails("UPDATE customers SET full_name = 'x' WHERE cust_id = 1", true);
    expect(result.allowed).toBe(true);
  });

  it('blocks UPDATE without WHERE even when writes are allowed', () => {
    const result = checkGuardrails("UPDATE customers SET full_name = 'x'", true);
    expect(result.allowed).toBe(false);
  });

  it('blocks DELETE without WHERE even when writes are allowed', () => {
    const result = checkGuardrails('DELETE FROM orders', true);
    expect(result.allowed).toBe(false);
  });

  it('blocks multiple stacked statements', () => {
    const result = checkGuardrails('SELECT 1; DROP TABLE customers;', false);
    expect(result.allowed).toBe(false);
  });

  it('blocks PRAGMA statements', () => {
    const result = checkGuardrails('PRAGMA table_info(customers)', false);
    expect(result.allowed).toBe(false);
  });
});
