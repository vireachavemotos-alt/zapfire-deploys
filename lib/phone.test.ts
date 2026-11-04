// Testes de phone.ts — rodar com um runner que entenda TS, ex.:
//   npx tsx --test lib/phone.test.ts
// (Projeto não traz jest; node --test puro não compila TS.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePhone, toggleNinthDigit, phoneVariants } from "./phone";

test("normalizePhone — espaços e separadores", () => {
  assert.equal(normalizePhone(" 11 98888-7766 "), "5511988887766");
});

test("normalizePhone — com +55", () => {
  assert.equal(normalizePhone("+55 11 98888-7766"), "5511988887766");
});

test("normalizePhone — 10 dígitos (fixo DDD+8)", () => {
  assert.equal(normalizePhone("1133334444"), "551133334444");
});

test("normalizePhone — 11 dígitos (celular DDD+9+8)", () => {
  assert.equal(normalizePhone("11988887766"), "5511988887766");
});

test("normalizePhone — 13 dígitos já com 55", () => {
  assert.equal(normalizePhone("5511988887766"), "5511988887766");
});

test("normalizePhone — lixo rejeitado", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone("123"), null);
});

test("toggleNinthDigit — adiciona o 9 em celular 12→13", () => {
  assert.equal(toggleNinthDigit("551188887766"), "5511988887766");
});

test("toggleNinthDigit — remove o 9 em celular 13→12", () => {
  assert.equal(toggleNinthDigit("5511988887766"), "551188887766");
});

test("toggleNinthDigit — fixo (primeiro dígito 2-5) não ganha 9", () => {
  assert.equal(toggleNinthDigit("551133334444"), "551133334444");
});

test("toggleNinthDigit — não-BR passa reto", () => {
  assert.equal(toggleNinthDigit("14155550100"), "14155550100");
});

test("phoneVariants — celular 11 dígitos devolve as duas formas", () => {
  const v = phoneVariants("11988887766");
  assert.deepEqual(v.sort(), ["5511988887766", "551188887766"].sort());
});

test("phoneVariants — fixo devolve só a forma única", () => {
  assert.deepEqual(phoneVariants("1133334444"), ["551133334444"]);
});

test("phoneVariants — lixo devolve array vazio", () => {
  assert.deepEqual(phoneVariants("abc"), []);
});
