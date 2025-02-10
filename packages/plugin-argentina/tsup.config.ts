import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts"],
    outDir: "dist",
    format: "esm",
    dts: true,
    clean: true,
    sourcemap: true,
    external: ["dotenv", "zod", "path", "fs"],
});
