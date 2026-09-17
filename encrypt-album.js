"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MAGIC = Buffer.from("PHENC1");
const ITERATIONS = 210000;
const VERIFIER_TEXT = Buffer.from("photos-ok", "utf8");
const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);

function parseArgs(argv) {
  const out = { dir: "", password: "", remove: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir") out.dir = argv[++i] || "";
    else if (a === "--password") out.password = argv[++i] || "";
    else if (a === "--remove") out.remove = true;
  }
  return out;
}

function pbkdf2(password, salt) {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
}

function encryptBuf(key, data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, tag, enc]);
}

function main() {
  const args = parseArgs(process.argv);
  const dir = args.dir || "resources/diary";
  const password = args.password || process.env.ALBUM_PASSWORD || "";
  if (!password) {
    console.error("用法: node encrypt-album.js --dir resources/diary --password 你的密码 [--remove]");
    process.exit(1);
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error("目录不存在: " + dir);
    process.exit(1);
  }

  const cryptoPath = path.join(dir, ".crypto.json");
  let salt;
  let key;
  if (fs.existsSync(cryptoPath)) {
    const meta = JSON.parse(fs.readFileSync(cryptoPath, "utf8"));
    salt = Buffer.from(meta.salt, "base64");
    key = pbkdf2(password, salt);
    const check = decryptBuf(key, Buffer.from(meta.verifier, "base64"));
    if (!check || check.toString("utf8") !== "photos-ok") {
      console.error("密码与已有 .crypto.json 不匹配");
      process.exit(1);
    }
  } else {
    salt = crypto.randomBytes(16);
    key = pbkdf2(password, salt);
  }

  const verifier = encryptBuf(key, VERIFIER_TEXT);
  const meta = {
    version: 1,
    salt: salt.toString("base64"),
    iterations: ITERATIONS,
    verifier: verifier.toString("base64"),
  };
  fs.writeFileSync(cryptoPath, JSON.stringify(meta, null, "\t"));

  const files = fs.readdirSync(dir);
  let n = 0;
  files.forEach(function (name) {
    const ext = path.extname(name).toLowerCase();
    if (!IMG_EXT.has(ext)) return;
    const src = path.join(dir, name);
    if (!fs.statSync(src).isFile()) return;
    const out = path.join(dir, name + ".enc");
    const data = fs.readFileSync(src);
    fs.writeFileSync(out, encryptBuf(key, data));
    n++;
    console.log("encrypted: " + name + " -> " + name + ".enc");
    if (args.remove) {
      fs.unlinkSync(src);
      console.log("removed: " + name);
    }
  });

  console.log("done. files=" + n + " meta=" + cryptoPath);
  if (!args.remove) {
    console.log("提示: 确认无误后加 --remove 删除明文原图，并勿把明文提交到仓库");
  }
}

function decryptBuf(key, buf) {
  try {
    if (buf.length < 6 + 12 + 16) return null;
    if (!buf.slice(0, 6).equals(MAGIC)) return null;
    const iv = buf.slice(6, 18);
    const tag = buf.slice(18, 34);
    const data = buf.slice(34);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch (e) {
    return null;
  }
}

main();
