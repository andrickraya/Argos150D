// Servidor de Iñaki: recibe el contexto de la app (dónde está el usuario, a dónde va, qué hay cerca)
// y le pide la frase a un modelo local servido por Ollama. Sin dependencias (Node 18 o más nuevo).
//
// Uso, en la computadora que tiene el modelo:
//   1. Instalar Ollama y bajar un modelo:      ollama pull llama3.2
//   2. Arrancar este servidor:                  node tools/inaki_server.js
//   3. Abrir la app con:  ...?inaki=https://DIRECCION-PUBLICA/inaki
//      (la app vive en https, así que esta máquina se debe publicar con un túnel https;
//       http://localhost:8787/inaki sólo sirve probando en la misma computadora)
//
// Variables opcionales:  PUERTO=8787  INAKI_MODELO=llama3.2  OLLAMA_URL=http://127.0.0.1:11434
// Si el cuerpo trae "imagen" (JPEG en base64) se le pasa al modelo: requiere un modelo con visión.
const http = require("http");

const PUERTO = Number(process.env.PUERTO) || 8787;
const MODELO = process.env.INAKI_MODELO || "llama3.2";
const OLLAMA = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");

const SISTEMA =
  "Eres Iñaki, el lobo mascota de la Universidad Iberoamericana Ciudad de México. " +
  "Guías a una persona que camina por el campus con su celular. " +
  "Responde SIEMPRE en español, en máximo 2 frases cortas, con tono amable y animado. " +
  "Usa únicamente los datos del CONTEXTO (lugares, metros, giros); no inventes lugares, precios ni menús. " +
  "Si hay un giro próximo, dilo claramente (derecha o izquierda y en cuántos metros).";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type"
};
const responder = (res, codigo, obj) => {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", ...cors });
  res.end(JSON.stringify(obj));
};

async function preguntarAlModelo({ evento, sugerencia, contexto, imagen }) {
  const usuario = {
    role: "user",
    content:
      `EVENTO: ${evento || "desconocido"}\n` +
      `CONTEXTO: ${JSON.stringify(contexto || {})}\n` +
      `FRASE SUGERIDA: ${sugerencia || ""}\n` +
      "Di tu frase como Iñaki." + (imagen ? " La imagen es lo que ve la cámara de la persona." : "")
  };
  if (imagen) usuario.images = [String(imagen).replace(/^data:image\/\w+;base64,/, "")];
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO,
      stream: false,
      options: { temperature: 0.6, num_predict: 90 },
      messages: [{ role: "system", content: SISTEMA }, usuario]
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) throw new Error(`Ollama respondió ${r.status}`);
  const j = await r.json();
  const texto = j && j.message && typeof j.message.content === "string" ? j.message.content.trim() : "";
  if (!texto) throw new Error("El modelo no regresó texto");
  return texto;
}

http
  .createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    if (req.method === "GET") { responder(res, 200, { ok: true, modelo: MODELO, uso: "POST /inaki" }); return; }
    if (req.method !== "POST") { responder(res, 405, { error: "Usa POST" }); return; }
    let cuerpo = "";
    req.on("data", (d) => {
      cuerpo += d;
      if (cuerpo.length > 8e6) req.destroy(); // tope de 8 MB (una foto)
    });
    req.on("end", async () => {
      let datos;
      try { datos = JSON.parse(cuerpo || "{}"); } catch (_) { responder(res, 400, { error: "JSON inválido" }); return; }
      const t0 = Date.now();
      try {
        const texto = await preguntarAlModelo(datos);
        console.log(`[${datos.evento}] ${Date.now() - t0} ms → ${texto}`);
        responder(res, 200, { texto });
      } catch (e) {
        console.error(`[${datos.evento}] error: ${e.message}`);
        responder(res, 502, { error: e.message }); // la app se queda con su frase local
      }
    });
  })
  .listen(PUERTO, () => console.log(`Iñaki escuchando en http://localhost:${PUERTO}/inaki  (modelo ${MODELO}, Ollama en ${OLLAMA})`));
