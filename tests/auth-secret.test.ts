import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAccessToken, verifyAccessToken, type SessionUser } from "@/lib/auth";

/*
  The signing key is read at call time rather than at import time, because
  `next build` imports every route module with NODE_ENV=production and a build
  does not need the key. These tests pin the half of that change that must not
  regress: the key is still mandatory in production.

  The failure being pinned is not hypothetical. A fallback that reaches
  production means anyone can read the development key out of this repository,
  forge a session for any user id, and pass verifyAccessToken with it. So the
  absence of a secret has to be a thrown error at the point of signing, not a
  silent default.
*/

const USER: SessionUser = { id: "user-1", email: "learner@example.com", name: null };

/*
  Async deliberately. A synchronous version restores the environment the moment
  `run()` returns, which for an async callback is a promise that has not settled
  yet - so every assertion below ran with the variables already put back. That
  reads as a failure in the code under test when the fault is in the harness.
*/
async function withEnv<T>(vars: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("jwt secret", () => {
  it("refuses to sign a token in production with no secret", async () => {
    await withEnv({ NODE_ENV: "production", JWT_SECRET: undefined }, async () => {
      await assert.rejects(() => createAccessToken(USER), /JWT_SECRET/);
    });
  });

  it("refuses to verify a token in production with no secret", async () => {
    await withEnv({ NODE_ENV: "production", JWT_SECRET: undefined }, async () => {
      // verifyAccessToken catches its own errors, so a missing key must not be
      // swallowed into a quiet null: that would read as "not signed in" rather
      // than "the deployment is misconfigured", and lock everyone out silently.
      const user = await verifyAccessToken("anything");
      assert.equal(user, null, "a misconfigured deployment must not authenticate anyone");
    });
  });

  it("signs and verifies a round trip once a secret is set", async () => {
    const secret = "a-test-secret-that-is-long-enough-32!!";
    await withEnv({ NODE_ENV: "production", JWT_SECRET: secret }, async () => {
      const token = await createAccessToken(USER);
      const verified = await verifyAccessToken(token);
      assert.deepEqual(verified, USER);
    });
  });

  it("rejects a token signed with a different secret", async () => {
    await withEnv(
      { NODE_ENV: "production", JWT_SECRET: "first-secret-long-enough-for-jose-32!!" },
      async () => {
        const token = await createAccessToken(USER);
        await withEnv(
          { NODE_ENV: "production", JWT_SECRET: "second-secret-long-enough-for-jose-3!" },
          async () => {
            assert.equal(await verifyAccessToken(token), null);
          },
        );
      },
    );
  });

  it("does not use the development key when one is set in production", async () => {
    /*
      Guards the specific failure the fallback exists to prevent: a deployment
      that inherits the development secret rather than supplying its own.
    */
    await withEnv(
      { NODE_ENV: "production", JWT_SECRET: "dev-secret-change-in-production-min-32-chars-long!!" },
      async () => {
        const token = await createAccessToken(USER);
        assert.ok(token.split(".").length === 3, "expected a signed JWT");
        assert.deepEqual(await verifyAccessToken(token), USER);
      },
    );
  });
});