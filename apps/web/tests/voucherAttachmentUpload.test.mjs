import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const voucherEntryPath = fileURLToPath(new URL("../src/pages/VoucherEntry.tsx", import.meta.url));

test("voucher entry uploads selected attachment binary content instead of manual metadata only", () => {
  const source = readFileSync(voucherEntryPath, "utf8");

  assert.match(source, /Upload/, "Voucher entry should expose a file picker.");
  assert.match(source, /contentBase64/, "Voucher entry should send encoded file content to the attachment API.");
  assert.doesNotMatch(source, /attachmentByteSize/, "Users should not have to type attachment byte size manually.");
});
