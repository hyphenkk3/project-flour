import { randomBytes } from "node:crypto";

const TEMPORARY_PASSWORD_LENGTH = 16;
const TEMPORARY_PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomCharsetIndex(): number {
  const charsetLength = TEMPORARY_PASSWORD_CHARSET.length;
  const limit = 256 - (256 % charsetLength);

  while (true) {
    const byte = randomBytes(1)[0];
    if (byte === undefined || byte >= limit) {
      continue;
    }
    return byte % charsetLength;
  }
}

export function generateTemporaryStaffPassword(): string {
  let password = "";
  for (let index = 0; index < TEMPORARY_PASSWORD_LENGTH; index += 1) {
    password += TEMPORARY_PASSWORD_CHARSET[randomCharsetIndex()];
  }
  return password;
}
