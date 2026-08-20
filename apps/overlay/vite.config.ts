import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Server phục vụ app này dưới prefix "/overlay/" (xem http-server.ts,
  // fastifyStatic prefix: "/overlay/"). Không set base thì Vite build ra
  // đường dẫn asset tuyệt đối từ "/" (vd: /assets/index-xxx.js), lệch với
  // vị trí thật -> 404 khi mở link overlay. Bug thật gặp khi demo thật.
  base: "/overlay/",
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
