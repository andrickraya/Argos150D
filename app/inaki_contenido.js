// Lo que Iñaki SABE de cada lugar (base de conocimiento verificada).
// - La app dice "narracion" tal cual al acercarte (sin gastar llamadas a Gemini) y muestra "globo" en pantalla.
// - El Worker (worker/src/index.js) le pasa "datos" a Gemini para contestar preguntas sin inventar.
// Fuente: inaki_contenido_recorrido_19nov2026.json (investigación con fuentes IBERO) + confirmaciones de Andrick (2026-11-19).
// Para corregir un texto: edítalo aquí, corre  node tools/build_app.js  y vuelve a subir el Worker (npx wrangler deploy).
const INAKI_CONTENIDO = {
  version: "2026-11-19",
  lugares: {
    N03: {
      alias: ["lobo", "escultura"],
      nombre: "Escultura de Los Lobos",
      tipo: "lugar",
      radio: 12,
      gesto: "presentar",
      globo: "Somos Los Lobos de la IBERO: bronce de Francisco 'Pancho' Cárdenas, aquí desde 2002. Representamos fuerza, sabiduría y apertura.",
      narracion: "Antes de continuar, mira esta escultura. Somos Los Lobos de la IBERO. El maestro Francisco 'Pancho' Cárdenas nos creó en bronce y nos colocaron aquí el 15 de enero de 2002. Pesamos alrededor de una tonelada y media. Representamos la combatividad, la búsqueda de la sabiduría y la apertura de la Universidad a distintas ideas, credos y formas de pensar.",
      datos: [
        "Colocada el 15 de enero de 2002 en el jardín de la entrada principal, cerca del Auditorio José Sánchez Villaseñor.",
        "Obra del escultor mexicano Francisco 'Pancho' Cárdenas; bronce; aproximadamente una tonelada y media; técnica de cera fundida y ensamblaje de 60 piezas.",
        "El lobo es símbolo heráldico de la Casa Loyola: combatividad y búsqueda de sabiduría. El escultor la relacionó con la apertura a distintas religiones, credos e ideologías y con San Ignacio de Loyola."
      ],
      fuente: "https://prensa.ibero.mx/es-MX/nota/los-lobos-de-la-ibero-simbolo-de-fuerza-y-apertura-la-historia-detras-de-la-escultura"
    },
    N61: {
      alias: ["explanada"],
      nombre: "Explanada Central",
      tipo: "lugar",
      radio: 15,
      gesto: "presentar",
      globo: "Esta es la Explanada Central: el gran patio común de la IBERO, donde nos encontramos y convivimos. Debajo está El Cubo.",
      narracion: "Llegamos a la Explanada Central, uno de los espacios que articulan la vida universitaria. La idea del proyecto fue reunir las distintas áreas en una sola comunidad, en lugar de separarlas en escuelas aisladas. Por eso la explanada funciona como un gran patio común: aquí nos encontramos, conversamos y compartimos la vida del campus.",
      datos: [
        "La Explanada Central fue concebida como un gran patio común; la estructura departamental permitió un campus integrado en lugar de escuelas aisladas.",
        "Es lugar de encuentro, convivencia y sentido de comunidad. Aquí están las escaleras entre el Edificio N y El Cubo.",
        "El proyecto del campus Santa Fe se aprobó en 1984, bajo la responsabilidad del arquitecto Francisco Serrano, con participación inicial de Rafael Mijares.",
        "El ladrillo terracota ('tabique UIA', sistema de muro enhuacalado) integra el tabique con la estructura de concreto, ayuda al aislamiento y reduce el mantenimiento; se volvió un rasgo de identidad del campus."
      ],
      fuente: "Texto 'De la arquitectura jesuita a la IBERO: la historia de sus emblemáticos ladrillos'"
    },
    N10: {
      alias: ["cubo", "comedor"],
      nombre: "El Cubo",
      tipo: "tienda",
      radio: 25,
      gesto: "senalar",
      globo: "Aquí está El Cubo, uno de los comedores de la IBERO. Está bajo la Explanada Central, pero se entra a nivel de piso.",
      narracion: "Aquí está El Cubo, uno de los comedores de la IBERO y un punto de encuentro para la comunidad. Está debajo de la Explanada Central, aunque se entra a nivel de piso. Muy pronto podré mostrarte su menú.",
      datos: [
        "Comedor de la IBERO bajo la Explanada Central (nivel sótano); la entrada está a nivel de piso.",
        "Fue remodelado y reabrió en 2025 con un comedor más amplio.",
        "En febrero de 2025 la IBERO mencionó Mia Trattoria (pizzas), El Komal y La Tienda (botanas, bebidas y artículos básicos); no está confirmado que sigan operando hoy."
      ],
      menu: null, // pendiente: Andrick lo trae el 2026-11-23
      fuente: "https://portaladmin.ibero.mx/uploads/Intersuj_Guia_c515a36b41.pdf | https://prensa.ibero.mx/es-MX/nota/lasyloslobos-dan-su-opinion-sobre-el-nuevo-cubo-ibero"
    },
    N64: {
      alias: ["camelia", "camellia"],
      nombre: "Camelia",
      tipo: "tienda",
      radio: 25,
      gesto: "senalar",
      globo: "Otra opción para comer o tomar algo: Camelia, entre los edificios C y D, en planta baja.",
      narracion: "Otra opción para comer o tomar algo es Camelia, entre los edificios C y D, en planta baja. Muy pronto podré mostrarte su menú.",
      datos: [
        "Cafetería entre los edificios C y D, planta baja. La guía oficial INTERSUJ 2026 lo escribe 'Camelia', con una sola ele."
      ],
      menu: null, // pendiente: Andrick lo trae el 2026-11-23
      fuente: "https://portaladmin.ibero.mx/uploads/Intersuj_Guia_c515a36b41.pdf"
    },
    N07: {
      alias: ["pb03", "laboratorio", "salon c", "edificio c"],
      nombre: "Salón C (Laboratorio PB03)",
      tipo: "lugar",
      radio: 12,
      gesto: "presentar",
      globo: "Este es el laboratorio PB03 del Edificio C: aquí se programa, se trabaja con bases de datos y se construyen aplicaciones.",
      narracion: "Este es uno de los espacios donde la experiencia universitaria se vuelve práctica. En este laboratorio se trabaja con servidores de aplicaciones, bases de datos y desarrollo web, con lenguajes como Python, Java, C y PHP, y bases de datos como MySQL y MongoDB. En ingeniería, aprender también significa experimentar, equivocarse, corregir y volver a intentar.",
      datos: [
        "Laboratorio de Aplicaciones Específicas, salón PB03 del Edificio C, planta baja. Es el salón de Andrick.",
        "Se trabaja con servidores de aplicaciones, bases de datos y desarrollo web; lenguajes como Python, Java, C y PHP; bases de datos como MySQL y MongoDB."
      ],
      fuente: "https://laboratorios.ibero.mx/laboratorios/laboratorio-de-aplicaciones-especificas-1-y-2/"
    }
  },
  // Datos generales que Gemini puede usar para preguntas abiertas
  generales: [
    "La IBERO ofrece seis ingenierías: Inteligencia Artificial; Ciencia de Datos; Mecatrónica y Sistemas Ciberfísicos; Biomédica; Mecánica y Eléctrica; Tecnologías de Cómputo y Telecomunicaciones (nota del 10 de noviembre de 2026).",
    "La IBERO tiene más de 170 laboratorios y talleres especializados.",
    "Ingeniería en Ciencia de Datos transforma grandes volúmenes de información en conocimiento útil para decisiones en finanzas, salud y negocios; el LITAC es un espacio de cómputo avanzado, datos y algoritmos.",
    "ARGOS es la app de navegación en realidad aumentada de Andrick para la materia Tecnologías Emergentes (Ingeniería en Ciencia de Datos)."
  ],
  reglas: [
    "No inventar menús, productos, precios, horarios, disponibilidad ni enlaces de pedido. Hoy NO hay menús cargados: si preguntan, decir que pronto estarán.",
    "La indicación de navegación va antes que cualquier dato curioso."
  ]
};
if (typeof window !== "undefined") window.INAKI_CONTENIDO = INAKI_CONTENIDO;
if (typeof module !== "undefined" && module.exports) module.exports = INAKI_CONTENIDO;
