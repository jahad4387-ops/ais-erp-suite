import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertVoucherCanBePosted,
  getVoucherBalance,
  isVoucherBalanced
} from "../src/ledger.mjs";

test("balanced voucher can be posted", () => {
  const voucher = {
    lines: [
      { accountCode: "1001", debit: 100, credit: 0 },
      { accountCode: "6001", debit: 0, credit: 100 }
    ]
  };

  assert.equal(isVoucherBalanced(voucher), true);
  assert.equal(assertVoucherCanBePosted(voucher), true);
});

test("unbalanced voucher is rejected", () => {
  const voucher = {
    lines: [
      { accountCode: "1001", debit: 100, credit: 0 },
      { accountCode: "6001", debit: 0, credit: 90 }
    ]
  };

  assert.equal(isVoucherBalanced(voucher), false);
  assert.throws(() => assertVoucherCanBePosted(voucher), /not balanced/);
});

test("voucher balance returns debit, credit, and difference", () => {
  const balance = getVoucherBalance({
    lines: [
      { debit: 20, credit: 0 },
      { debit: 0, credit: 15 }
    ]
  });

  assert.deepEqual(balance, {
    debit: 20,
    credit: 15,
    difference: 5
  });
});
