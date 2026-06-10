import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../src", import.meta.url));

function listTsxFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return listTsxFiles(path);
    }
    return path.endsWith(".tsx") ? [path] : [];
  });
}

function collectMatches(pattern) {
  return listTsxFiles(sourceRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return pattern.test(source) ? [file] : [];
  });
}

test("Ant Design v6 deprecated props are not used in web UI", () => {
  const deprecatedSpaceDirection = collectMatches(/<Space\b[^>]*\bdirection=/m);
  const deprecatedAlertMessage = collectMatches(/<Alert\b[^>]*\bmessage=/m);
  const deprecatedStatisticValueStyle = collectMatches(/<Statistic\b[^>]*\bvalueStyle=/m);

  assert.deepEqual(
    {
      SpaceDirection: deprecatedSpaceDirection,
      AlertMessage: deprecatedAlertMessage,
      StatisticValueStyle: deprecatedStatisticValueStyle
    },
    {
      SpaceDirection: [],
      AlertMessage: [],
      StatisticValueStyle: []
    }
  );
});
