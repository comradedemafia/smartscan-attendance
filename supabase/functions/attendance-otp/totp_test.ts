import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  base32Decode,
  generateTOTP,
  generateTOTPAt,
  verifyTOTP,
} from "./index.ts";

// RFC 6238 reference secret "12345678901234567890" base32-encoded
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

Deno.test("base32Decode returns ArrayBuffer-backed Uint8Array", () => {
  const out = base32Decode(RFC_SECRET);
  assert(out instanceof Uint8Array);
  assert(out.buffer instanceof ArrayBuffer, "buffer must be ArrayBuffer, not SharedArrayBuffer");
  assertEquals(out.length, 20);
  // First bytes correspond to ASCII "12345..."
  assertEquals(out[0], 0x31);
  assertEquals(out[1], 0x32);
});

Deno.test("base32Decode handles padding and lowercase", () => {
  const a = base32Decode("JBSWY3DPEHPK3PXP");
  const b = base32Decode("jbswy3dpehpk3pxp====");
  assertEquals(Array.from(a), Array.from(b));
});

Deno.test("generateTOTPAt matches RFC 6238 SHA-1 vectors (6 digits)", async () => {
  // From RFC 6238 Appendix B (SHA-1, 30s step). Counter = unixTime / 30.
  const cases: Array<[number, string]> = [
    [59 / 30 | 0, "287082"],            // T = 59
    [1111111109 / 30 | 0, "081804"],    // T = 1111111109
    [1111111111 / 30 | 0, "050471"],    // T = 1111111111
    [1234567890 / 30 | 0, "005924"],    // T = 1234567890
    [2000000000 / 30 | 0, "279037"],    // T = 2000000000
  ];
  for (const [counter, expected] of cases) {
    const code = await generateTOTPAt(RFC_SECRET, counter, 6);
    assertEquals(code, expected, `counter ${counter}`);
  }
});

Deno.test("generateTOTP produces a 6-digit numeric string for varied secrets", async () => {
  const secrets = [
    "JBSWY3DPEHPK3PXP",
    "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    "MFRGGZDFMZTWQ2LK",
  ];
  for (const s of secrets) {
    const code = await generateTOTP(s);
    assertEquals(code.length, 6);
    assert(/^\d{6}$/.test(code), `expected digits, got ${code}`);
  }
});

Deno.test("verifyTOTP accepts current code and rejects wrong code", async () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const code = await generateTOTP(secret);
  assertEquals(await verifyTOTP(secret, code), true);
  assertEquals(await verifyTOTP(secret, "000000"), false);
});

Deno.test("verifyTOTP accepts the previous time-step (clock drift -30s)", async () => {
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const prevCounter = (Math.floor(Date.now() / 1000 / 30)) - 1;
  const prevCode = await generateTOTPAt(secret, prevCounter, 6);
  assertEquals(await verifyTOTP(secret, prevCode), true);
});
