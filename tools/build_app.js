// Regenera app/index.html y app/ar.html incrustando app/campus_data.js y app/app.js.
// Uso (desde la raíz del repo):  node tools/build_app.js
// Edita SIEMPRE app.js / campus_data.js y luego corre este script; no edites el JS dentro del HTML.
const fs = require("fs");
const path = require("path");

const dirApp = path.join(__dirname, "..", "app");
const leer = (f) => fs.readFileSync(path.join(dirApp, f), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");

const marcador = "<!-- DATOS Y LÓGICA INTEGRADOS";
const plantilla = leer("index.html");
const ini = plantilla.indexOf(marcador);
const fin = plantilla.lastIndexOf("</body>");
if (ini < 0 || fin < 0) throw new Error("No encontré el marcador de scripts o </body> en index.html");

const inicioLinea = plantilla.lastIndexOf("\n", ini) + 1;
const bloque =
  "    <!-- DATOS Y LÓGICA INTEGRADOS (generado por tools/build_app.js; no editar a mano) -->\n" +
  "    <script>\n" + leer("campus_data.js").trimEnd() + "\n</script>\n" +
  "<script>\n" + leer("app.js").trimEnd() + "\n</script>\n  ";

const salida = plantilla.slice(0, inicioLinea) + bloque + plantilla.slice(fin);
for (const f of ["index.html", "ar.html"]) fs.writeFileSync(path.join(dirApp, f), salida, "utf8");
console.log(`OK: index.html y ar.html regenerados (${salida.length} caracteres).`);
