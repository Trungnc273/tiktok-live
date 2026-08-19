import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Config lint tối thiểu dùng chung toàn monorepo (docs/promp/PHASE_13.md yêu cầu
 * "lint" là 1 trong các lệnh bắt buộc chạy ở M12). Không bật rule kiểu-nghiêm ngặt
 * cần type-checking (parserOptions.project) để giữ tốc độ chạy nhanh — typecheck
 * riêng đã có `tsc --noEmit` ở từng app, không cần trùng lặp qua ESLint.
 */
export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/drizzle/**", "**/.media/**", "**/sounds/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
);
