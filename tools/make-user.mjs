// Uso: node tools/make-user.mjs "usuario" "Nombre visible" "2027-12-31" [contraseña]
// Si no das contraseña, genera una aleatoria. Imprime la línea para js/users.js
import { pbkdf2Sync, randomBytes } from "node:crypto";

const [user, name = user, expires = "", pass] = process.argv.slice(2);
if (!user) {
  console.error('Uso: node tools/make-user.mjs "usuario" "Nombre" "AAAA-MM-DD" [contraseña]');
  process.exit(1);
}
const password = pass || randomBytes(9).toString("base64url");
const salt = randomBytes(16).toString("hex");
const hash = pbkdf2Sync(password, Buffer.from(salt, "hex"), 150000, 32, "sha256").toString("hex");

console.log("\nContraseña (entrégala por un canal privado):", password);
console.log("\nPega esto dentro del arreglo de js/users.js:\n");
console.log(JSON.stringify({ user: user.toLowerCase(), name, salt, hash, expires }, null, 2) + ",\n");
