import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const apiPath = fileURLToPath(new URL("../src/api.ts", import.meta.url));

test("api errors shown to users are localized to Chinese", () => {
  const source = readFileSync(apiPath, "utf8");

  const requiredChineseMessages = [
    "制单人不能审核自己创建的凭证。",
    "权限不足，无法执行该操作。",
    "凭证所属会计期间必须先打开。",
    "仍有未记账凭证，不能关闭会计期间。",
    "会计科目已被凭证引用，不能删除。",
    "智能凭证附件必须存在、属于当前账套且状态可用。",
    "网络请求失败，请检查后端服务是否已启动。"
  ];

  for (const message of requiredChineseMessages) {
    assert.match(source, new RegExp(message.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(source, /errorCodeText/);
  assert.match(source, /errorMessagePatterns/);
  assert.match(source, /code === 'BUSINESS_RULE_FAILED'/);
  assert.match(source, /catch \(error\)/);
  assert.doesNotMatch(source, /return message \|\| code \|\| '接口请求失败'/);
});
