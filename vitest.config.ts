import { defineConfig } from "vitest/config";

// Config propia y mínima para los ensayos: NO carga la config de la app
// (nitro/tanstack) para que las pruebas corran rápido y aisladas.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
