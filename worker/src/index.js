// Worker de Iñaki: recibe { evento, sugerencia, contexto } desde ARGOS, pregunta a Gemini
// y regresa { texto, gesto }. La API key vive como secreto (env.GEMINI_API_KEY), nunca en el celular.
// Versión 1: solo el "tubo" app → Worker → Gemini. El grounding completo y las herramientas llegan después.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// Sin acentos: son los nombres de las animaciones del GLB de Iñaki
const GESTOS = ["ninguno", "saludar", "senalar", "presentar", "celebrar", "pensar"];

import CONTENIDO from "../../app/inaki_contenido.js";

// Base de conocimiento verificada (grounding): la misma que usa la app
const CONOCIMIENTO = [
  ...Object.entries(CONTENIDO.lugares).map(([id, l]) =>
    `- ${l.nombre} (${id}, ${l.tipo}): ${l.datos.join(" ")}${l.tipo === "tienda" && !l.menu ? " Menú: AÚN NO DISPONIBLE." : ""}`),
  ...CONTENIDO.generales.map((g) => `- ${g}`)
].join("\n");

const SISTEMA = `Eres Iñaki, el lobo guía de ARGOS en el campus Santa Fe de la Universidad Iberoamericana (IBERO), CDMX.
Hablas en español de México, cálido y breve: máximo 2 frases y 200 caracteres.
Usa SOLO los datos de CONOCIMIENTO y del CONTEXTO. Si algo no está ahí, dilo con honestidad; nunca inventes lugares, menús, precios, horarios ni enlaces.
La seguridad y la indicación de navegación van primero: si hay un giro próximo, menciónalo.
Reglas: ${CONTENIDO.reglas.join(" ")}
Responde únicamente con el JSON pedido.

CONOCIMIENTO:
${CONOCIMIENTO}`;

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    texto: { type: "STRING" },
    gesto: { type: "STRING", enum: GESTOS }
  },
  required: ["texto", "gesto"]
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (req.method === "GET" && new URL(req.url).searchParams.has("modelos")) {
      // Diagnóstico: qué modelos "flash" puede usar esta key (no muestra la key)
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY } });
      const d = await r.json();
      return json((d.models || []).map((m) => m.name).filter((n) => /flash/.test(n)));
    }
    if (req.method === "GET") return json({ ok: true, servicio: "argos-inaki", modelo: env.MODELO, key: !!env.GEMINI_API_KEY });
    if (req.method !== "POST") return json({ error: "método no permitido" }, 405);
    if (!env.GEMINI_API_KEY) return json({ error: "falta GEMINI_API_KEY" }, 500);

    let cuerpo;
    try { cuerpo = await req.json(); } catch (_) { return json({ error: "JSON inválido" }, 400); }
    const evento = String(cuerpo.evento || "pregunta").slice(0, 40);
    const sugerencia = String(cuerpo.sugerencia || "").slice(0, 300);
    const contexto = JSON.stringify(cuerpo.contexto || {}).slice(0, 4000);

    const pregunta = String(cuerpo.pregunta || "").slice(0, 300);
    const prompt = pregunta
      ? `PREGUNTA DEL USUARIO: ${pregunta}\nCONTEXTO: ${contexto}\nContesta SOLO la pregunta como Iñaki, usando solo CONOCIMIENTO y CONTEXTO. No des indicaciones de navegación a menos que te pregunten cómo llegar.`
      : `EVENTO: ${evento}\nFRASE LOCAL SUGERIDA: ${sugerencia}\nCONTEXTO: ${contexto}\n` +
        `Di lo que Iñaki debe decir ahora. Puedes mejorar la frase sugerida, pero sin cambiar la indicación de navegación.`;

    // Memoria corta del chat: últimos 6 mensajes (usuario / Iñaki)
    const historial = (Array.isArray(cuerpo.historial) ? cuerpo.historial : []).slice(-6)
      .filter((m) => m && typeof m.texto === "string" && m.texto.trim())
      .map((m) => ({ role: m.rol === "inaki" ? "model" : "user", parts: [{ text: m.texto.slice(0, 300) }] }));

    const t0 = Date.now();
    // Primero el modelo principal; si está saturado (429/503) o tarda, el de respaldo. La app corta a los 8 s.
    const intentos = [[env.MODELO, 4500], [env.MODELO_RESPALDO, 3000]].filter(([m]) => m);
    let r, modeloUsado;
    for (const [modelo, limite] of intentos) {
      modeloUsado = modelo;
      try {
        r = await llamarGemini(env, modelo, historial, prompt, limite);
      } catch (_) { r = null; continue; } // no respondió a tiempo
      if (r.ok || (r.status !== 429 && r.status !== 503)) break;
    }
    if (!r) return json({ error: "Gemini no respondió a tiempo", ms: Date.now() - t0 }, 504);
    if (!r.ok) {
      // 429 = se acabó la cuota gratuita del minuto/día. La app usa su frase local.
      return json({ error: "Gemini respondió " + r.status, detalle: (await r.text()).slice(0, 300) }, 502);
    }
    const datos = await r.json();
    const crudo = datos?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    let salida;
    try { salida = JSON.parse(crudo); } catch (_) { salida = null; }
    if (!salida || typeof salida.texto !== "string" || !salida.texto.trim()) {
      return json({ texto: sugerencia, gesto: "ninguno", respaldo: true, ms: Date.now() - t0 });
    }
    return json({
      texto: salida.texto.trim().slice(0, 220),
      gesto: GESTOS.includes(salida.gesto) ? salida.gesto : "ninguno",
      modelo: modeloUsado,
      ms: Date.now() - t0
    });
  }
};

function llamarGemini(env, modelo, historial, prompt, limiteMs) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        signal: AbortSignal.timeout(limiteMs),
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SISTEMA }] },
          contents: [...historial, { role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: ESQUEMA,
            thinkingConfig: { thinkingLevel: "minimal" } // frases cortas: poco "pensar" = respuesta rápida
          }
        })
      });
}
