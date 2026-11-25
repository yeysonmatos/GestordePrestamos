import { describe, expect, it } from "vitest";

import { passwordError } from "./password";

describe("passwordError — contraseñas nuevas", () => {
  it("acepta 8+ caracteres con letras y números", () => {
    expect(passwordError("prestamo26")).toBeNull();
    expect(passwordError("Año2026xx")).toBeNull();
  });
  it("rechaza menos de 8 caracteres", () => {
    expect(passwordError("abc1234")).toMatch(/8 caracteres/);
  });
  it("rechaza solo letras o solo números", () => {
    expect(passwordError("solamenteletras")).toMatch(/letras y números/);
    expect(passwordError("1234567890")).toMatch(/letras y números/);
  });
});
