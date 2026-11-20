// Worker de Iñaki: recibe { evento, sugerencia, contexto } desde ARGOS, pregunta a Gemini
// y regresa { texto, gesto }. La API key vive como secreto (env.GEMINI_API_KEY), nunca en el celular.
// Versión 1: solo el "tubo" app → Worker → Gemini. El grounding completo y las herramientas llegan después.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const GESTOS = ["ninguno", "saludar", "señalar", "presentar", "celebrar", "pensar"];

const SISTEMA = `Eres Iñaki, el guía de ARGOS en el campus Santa Fe de la Universidad Iberoamericana (IBERO), CDMX.
Hablas en español de México, cálido y breve: máximo 2 frases y 200 caracteres.
Usa SOLO los datos del CONTEXTO. Si algo no está ahí, dilo con honestidad; nunca inventes lugares, menús, precios ni horarios.
La seguridad y la indicación de navegación van primero: si hay un giro próximo, menciónalo.
Responde únicamente con el JSON pedido.`;

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

    const prompt = `EVENTO: ${evento}\nFRASE LOCAL SUGERIDA: ${sugerencia}\nCONTEXTO: ${contexto}\n` +
      `Di lo que Iñaki debe decir ahora. Puedes mejorar la frase sugerida, pero sin cambiar la indicación de navegación.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.MODELO}:generateContent`;
    const t0 = Date.now();
    let r;
    try {
      r = await fetch(url, {
        signal: AbortSignal.timeout(7000), // la app corta a los 8 s y usa su frase local
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SISTEMA }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: ESQUEMA,
            thinkingConfig: { thinkingLevel: "low" } // frases cortas: poco "pensar" = respuesta rápida
          }
        })
      });
    } catch (e) {
      return json({ error: "Gemini no respondió a tiempo", ms: Date.now() - t0 }, 504);
    }
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
      ms: Date.now() - t0
    });
  }
};
