import assert from "node:assert/strict";
import test from "node:test";
import {
  hasResolvableEmailDomain,
  type EmailDomainResolvers
} from "../src/lib/email-verification";

function createResolvers(overrides: Partial<EmailDomainResolvers> = {}): EmailDomainResolvers {
  return {
    resolveMx: async () => [],
    resolve4: async () => [],
    resolve6: async () => [],
    ...overrides
  };
}

test("accepts a domain with a mail exchanger", async () => {
  const result = await hasResolvableEmailDomain(
    "student@example.com",
    createResolvers({ resolveMx: async () => [{ exchange: "mail.example.com" }] })
  );

  assert.equal(result, true);
});

test("rejects a domain with a null MX record", async () => {
  const result = await hasResolvableEmailDomain(
    "student@example.com",
    createResolvers({ resolveMx: async () => [{ exchange: "." }] })
  );

  assert.equal(result, false);
});

test("accepts SMTP address fallback when the domain has an address record", async () => {
  const result = await hasResolvableEmailDomain(
    "student@example.com",
    createResolvers({ resolve4: async () => ["192.0.2.1"] })
  );

  assert.equal(result, true);
});

test("rejects a domain without MX, IPv4, or IPv6 records", async () => {
  const missingRecord = Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  const result = await hasResolvableEmailDomain(
    "student@example.com",
    createResolvers({
      resolveMx: async () => { throw missingRecord; },
      resolve4: async () => { throw missingRecord; },
      resolve6: async () => { throw missingRecord; }
    })
  );

  assert.equal(result, false);
});

test("does not query DNS for an invalid email string", async () => {
  let lookupCount = 0;
  const result = await hasResolvableEmailDomain("not-an-email", createResolvers({
    resolveMx: async () => {
      lookupCount += 1;
      return [];
    }
  }));

  assert.equal(result, false);
  assert.equal(lookupCount, 0);
});

test("propagates temporary DNS failures instead of reporting a valid domain as invalid", async () => {
  const temporaryFailure = Object.assign(new Error("resolver unavailable"), { code: "ESERVFAIL" });

  await assert.rejects(
    hasResolvableEmailDomain(
      "student@example.com",
      createResolvers({ resolveMx: async () => { throw temporaryFailure; } })
    ),
    temporaryFailure
  );
});
