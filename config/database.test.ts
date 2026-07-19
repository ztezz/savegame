import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";

test("SQLite transactions queue safely and release rolls back abandoned owners", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cloudsave-database-"));
  process.env.DATABASE_PATH = path.join(directory, "test.sqlite");
  process.env.SQLITE_TRANSACTION_TIMEOUT_MS = "100";
  const { pool } = await import("./database.js");

  try {
    const first = await pool.connect();
    const second = await pool.connect();
    await first.query("BEGIN");

    let secondStarted = false;
    const secondBegin = second.query("BEGIN").then(() => {
      secondStarted = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(secondStarted, false);

    await first.query("COMMIT");
    await secondBegin;
    assert.equal(secondStarted, true);

    second.release();
    const third = await pool.connect();
    await Promise.race([
      third.query("BEGIN"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("transaction queue remained locked")), 500)),
    ]);
    await third.query("ROLLBACK");

    const timedOut = await pool.connect();
    await timedOut.query("BEGIN");
    await new Promise((resolve) => setTimeout(resolve, 150));
    await assert.rejects(timedOut.query("SELECT 1"), /timed out and was rolled back/);

    const afterTimeout = await pool.connect();
    await Promise.race([
      afterTimeout.query("BEGIN"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("watchdog did not release transaction")), 500)),
    ]);
    await afterTimeout.query("ROLLBACK");
    timedOut.release();
  } finally {
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
