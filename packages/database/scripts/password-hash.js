const { createHmac, randomBytes, timingSafeEqual } = require("node:crypto");

function createPasswordHash(password, options = {}) {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("password is required.");
  }
  const salt = options.salt ?? randomBytes(16).toString("base64url");
  const digest = createHmac("sha256", salt).update(password).digest("base64url");
  return `sha256:${salt}:${digest}`;
}

function verifyPasswordHash(password, passwordHash) {
  if (typeof password !== "string" || typeof passwordHash !== "string") {
    return false;
  }
  const [algorithm, salt, expected] = passwordHash.split(":");
  if (algorithm !== "sha256" || !salt || !expected) {
    return false;
  }
  const actual = createHmac("sha256", salt).update(password).digest("base64url");
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function main(env = process.env) {
  const password = env.AIS_ADMIN_PASSWORD;
  if (!password) {
    throw new Error("AIS_ADMIN_PASSWORD is required to generate an administrator password hash.");
  }
  console.log(createPasswordHash(password));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  createPasswordHash,
  main,
  verifyPasswordHash
};
