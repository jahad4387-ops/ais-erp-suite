import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseSchemaPath = join(workspaceRoot, "packages", "database", "prisma", "schema.prisma");

function generatePrismaClient() {
  const npmCommand = process.platform === "win32" ? "cmd" : "npm";
  const args =
    process.platform === "win32"
      ? ["/c", "npx", "prisma", "generate", "--schema", databaseSchemaPath]
      : ["exec", "prisma", "generate", "--", "--schema", databaseSchemaPath];
  execFileSync(npmCommand, args, { cwd: workspaceRoot, stdio: "inherit" });
}

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

generatePrismaClient();

const prismaClientDir = resolvePrismaClientDir();
const sourceDir = resolveGeneratedClientDir(prismaClientDir);
const targetDir = join(workspaceRoot, "node_modules", ".prisma", "client");

rmSync(targetDir, { recursive: true, force: true });
mkdirSync(dirname(targetDir), { recursive: true });
cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Prepared Electron Prisma client: ${targetDir}`);
