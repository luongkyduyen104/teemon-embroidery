import { access, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

const exists = async (path: string) => {
  try { await access(path); return true; } catch { return false; }
};

export function sites(): Plugin {
  let root = process.cwd();
  return {
    name: "sites",
    apply: "build",
    configResolved(config) { root = config.root; },
    async closeBundle() {
      const output = resolve(root, "dist", ".openai");
      await rm(output, { recursive: true, force: true });
      await mkdir(output, { recursive: true });
      const config = resolve(root, ".openai", "hosting.json");
      if (await exists(config)) await cp(config, resolve(output, "hosting.json"));
    }
  };
}
