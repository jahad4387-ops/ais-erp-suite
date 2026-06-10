import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resolvePrismaClientDir() {
  const prismaClientEntry = require.resolve("@prisma/client", {
    paths: [join(workspaceRoot, "packages", "database", "src")]
  });
  return dirname(prismaClientEntry);
}

function resolveGeneratedClientDir(prismaClientDir) {
  const pnpmGeneratedDir = resolve(prismaClientDir, "..", "..", ".prisma", "client");
  if (existsSync(join(pnpmGeneratedDir, "default.js"))) {
    return pnpmGeneratedDir;
  }

  const rootGeneratedDir = join(workspaceRoot, "node_modules", ".prisma", "client");
  if (existsSync(join(rootGeneratedDir, "default.js"))) {
    return rootGeneratedDir;
  }

  throw new Error(
    `Prisma generated client was not found. Tried ${pnpmGeneratedDir} and ${rootGeneratedDir}. Run prisma generate first.`
  );
}

const prismaClientDir = resolvePrismaClientDir();
const sourceDir = resolveGeneratedClientDir(prismaClientDir);
const targetDir = join(workspaceRoot, "node_modules", ".prisma", "client");

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Prepared Electron Prisma client: ${targetDir}`);
