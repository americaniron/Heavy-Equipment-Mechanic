import { describe, expect, it } from "vitest";
import { publicCustomer } from "../src/lib/d1-helpers";

describe("publicCustomer", () => {
  it("strips password hashes from API payloads", () => {
    const row = publicCustomer({
      id: 1,
      email: "a@b.com",
      password_hash: "secret",
      first_name: "Ada",
    });
    expect(row.passwordHash).toBeUndefined();
    expect(row.password_hash).toBeUndefined();
    expect(row.email).toBe("a@b.com");
  });
});
