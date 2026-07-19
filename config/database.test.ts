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
    const queuedClients = await Promise.all(Array.from({ length: 4 }, () => pool.connect()));
    const queueOwner = await pool.connect();
    await queueOwner.query("BEGIN");
    const startOrder: number[] = [];
    const queuedTransactions = queuedClients.map(async (client, index) => {
      await client.query("BEGIN");
      startOrder.push(index);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await client.query("COMMIT");
      client.release();
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(startOrder, []);
    await queueOwner.query("COMMIT");
    queueOwner.release();
    await Promise.race([
      Promise.all(queuedTransactions),
      new Promise((_, reject) => setTimeout(() => reject(new Error("FIFO transaction queue stalled")), 1_000)),
    ]);
    assert.deepEqual(startOrder, [0, 1, 2, 3]);

    const abandoned = await pool.connect();
    await abandoned.query("BEGIN");
    abandoned.release();
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

    await pool.query("CREATE TABLE parents (id INTEGER PRIMARY KEY)");
    await pool.query("CREATE TABLE children (parent_id INTEGER, FOREIGN KEY (parent_id) REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED)");
    const failedCommit = await pool.connect();
    await failedCommit.query("BEGIN");
    await failedCommit.query("INSERT INTO children (parent_id) VALUES (999)");
    await assert.rejects(failedCommit.query("COMMIT"), /FOREIGN KEY constraint failed/);
    failedCommit.release();

    const afterFailedCommit = await pool.connect();
    await Promise.race([
      afterFailedCommit.query("BEGIN"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("failed COMMIT left transaction locked")), 500)),
    ]);
    const childRows = await afterFailedCommit.query("SELECT * FROM children");
    assert.deepEqual(childRows.rows, []);
    await afterFailedCommit.query("ROLLBACK");
    afterFailedCommit.release();
  } finally {
    await pool.end();
    await rm(directory, { recursive: true, force: true });
  }
});
