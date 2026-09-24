// Vercel's Hobby plan deploys at most 12 serverless functions. A 13th doesn't
// just fail itself — the whole deployment fails and the site stays on the
// previous build, which is how a finished feature once sat undeployed with no
// obvious error. Every .js file under api/ is a function except api/_lib/,
// which is shared code; put new handlers there and route to them.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIMIT = 12;

function functions(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name.startsWith("_") ? [] : functions(path);
    return name.endsWith(".js") && !name.startsWith("_") ? [path] : [];
  });
}

describe("Vercel function budget", () => {
  it(`stays within ${LIMIT} serverless functions`, () => {
    const found = functions("api");
    assert.ok(found.length <= LIMIT, `${found.length} functions (limit ${LIMIT}):\n  ${found.join("\n  ")}`);
  });
});
