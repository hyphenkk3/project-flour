#!/usr/bin/env node
'use strict';
// PFBAK01 format used by the existing Project Flour backup helper.
const fs = require('fs');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');

const [mode, file] = process.argv.slice(2);
if (!['encrypt', 'decrypt'].includes(mode) || !file) throw new Error('Usage: stream-crypto.js encrypt|decrypt FILE');
const passBytes = fs.readFileSync(Number(process.env.PF_SECRET_FD || 3));
const pass = passBytes.toString('utf8').replace(/\r?\n$/, '');
passBytes.fill(0);
if (Buffer.byteLength(pass) < 24) throw new Error('Passphrase must contain at least 24 bytes');
const magic = Buffer.from('PFBAK01');
const derive = salt => crypto.pbkdf2Sync(pass, salt, 600000, 32, 'sha256');

function writeAll(fd, buffer, position) {
  let written = 0;
  while (written < buffer.length) {
    written += fs.writeSync(fd, buffer, written, buffer.length - written, position + written);
  }
}

async function main() {
  if (mode === 'encrypt') {
    const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    const key = derive(salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const fd = fs.openSync(file, 'wx', 0o600);
    let offset = 51, inputBytes = 0;
    let fdOpen = true;
    try {
      writeAll(fd, Buffer.concat([magic, salt, iv, Buffer.alloc(16)]), 0);
      for await (const chunk of process.stdin) {
        inputBytes += chunk.length;
        const out = cipher.update(chunk);
        if (out.length) { writeAll(fd, out, offset); offset += out.length; }
      }
      if (inputBytes === 0) throw new Error('Refusing to encrypt an empty input stream');
      const last = cipher.final();
      if (last.length) { writeAll(fd, last, offset); offset += last.length; }
      const tag = cipher.getAuthTag();
      writeAll(fd, tag, 35);
      fs.fsyncSync(fd);
    } catch (error) {
      if (fdOpen) { fs.closeSync(fd); fdOpen = false; }
      fs.unlinkSync(file);
      throw error;
    } finally {
      key.fill(0);
    }
    fs.closeSync(fd);
  } else {
    const header = Buffer.alloc(51);
    const fd = fs.openSync(file, 'r');
    try {
      if (fs.readSync(fd, header, 0, header.length, 0) !== header.length ||
          !header.subarray(0, 7).equals(magic)) throw new Error('Invalid PFBAK01 archive');
      const stat = fs.fstatSync(fd);
      if (stat.size <= header.length) throw new Error('Encrypted archive has no payload');
      const key = derive(header.subarray(7, 23));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, header.subarray(23, 35));
      decipher.setAuthTag(header.subarray(35, 51));
      try {
        await pipeline(fs.createReadStream(file, { start: header.length }), decipher, process.stdout);
      } finally {
        key.fill(0);
      }
    } finally {
      header.fill(0);
      fs.closeSync(fd);
    }
  }
}
main().catch(e => { process.stderr.write(`${e.message}\n`); process.exitCode = 1; });
