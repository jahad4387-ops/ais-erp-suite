const { cpSync, existsSync, mkdirSync, rmSync } = require("node:fs");
const { dirname, join } = require("node:path");

exports.default = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const sourceDir = join(projectDir, "node_modules", ".prisma");
  const targetDir = join(context.appOutDir, "resources", "app", "node_modules", ".prisma");

  if (!existsSync(join(sourceDir, "client", "default.js"))) {
    throw new Error(`Prisma generated client is missing before packaging: ${sourceDir}`);
  }

  rmSync(targetDir, { recursive: true, force: true });
  mkdirSync(dirname(targetDir), { recursive: true });
  cpSync(sourceDir, targetDir, { recursive: true });
};
