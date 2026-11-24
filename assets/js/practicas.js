/* =====================================================================
   ARGOS — Prácticas: datos + tarjetas + vista detallada (modal)
   ---------------------------------------------------------------------
   • Las tarjetas de practicas.html se generan desde PRACTICAS.
   • Al hacer click en una tarjeta se abre la vista detallada.
   • Cada práctica tiene enlace directo: practicas.html#p1 … #p6
   • Para agregar capturas: copia la imagen a assets/img/practicas/
     y añádela al arreglo `imagenes` de la práctica: { src, pie }.
   ===================================================================== */

const PRACTICAS = [
  /* ------------------------------------------------------------- P1 */
  {
    id: 'p1',
    numero: 'Práctica 1',
    titulo: 'Fundamentos de Unity: GameObjects, Jerarquías y Prefabs',
    resumen:
      'Primer contacto con el editor: creamos figuras 3D, las organizamos en jerarquías padre-hijo y construimos un parque de diversiones con una rueda de la fortuna animada.',
    etiquetas: ['Unity Hub', 'Transform', 'Jerarquías', 'Prefabs', 'Animator'],
    video: { src: 'assets/videos/practica1-parque.mp4', tipo: 'video/mp4' },
    objetivo:
      'Comprender cómo se estructura lógicamente un proyecto en Unity antes de escribir una sola línea de código: ventanas principales, GameObjects, componentes y prefabs.',
    conceptos: [
      ['Unity Hub', 'Gestiona las versiones del motor (usamos 2022.3.58f1) y los proyectos. Al crear uno se elige una plantilla (2D, 3D, URP o HDRP) que preconfigura iluminación y render.'],
      ['Scene View / Game View', 'La escena es el espacio de trabajo donde colocamos cámaras, luces y objetos; la vista de juego es lo que ve el jugador a través de la cámara activa.'],
      ['GameObject', 'El bloque fundamental de Unity. Por sí solo no hace nada: necesita componentes.'],
      ['Jerarquía', 'Los objetos pueden ser padres o hijos; si se mueve el padre, el hijo lo acompaña. Es la base para armar objetos complejos.'],
      ['Componentes', 'Transform (posición, rotación, escala) es obligatorio. Vacío + Light = lámpara; vacío + Camera = cámara; vacío + Mesh Renderer = objeto visible.'],
      ['Prefab', 'Plano original guardado en el proyecto. Las instancias en la escena se actualizan solas si se modifica el prefab.']
    ],
    pasos: [
      'Creamos un proyecto <b>3D Core</b> llamado <code>Practica_1_RM</code> desde Unity Hub.',
      'Creamos la carpeta <code>Scene</code> y una escena llamada <code>objetos</code>.',
      'Agregamos todas las figuras de <i>GameObject → 3D Object</i> (cubo, esfera, cápsula, cilindro, plano, quad) y modificamos su componente <b>Transform</b>.',
      'Creamos una segunda escena, <code>Parque_diversiones</code>, priorizando las jerarquías para que cada atracción pudiera moverse como una sola pieza.',
      'Animamos una <b>rueda de la fortuna</b> con giro continuo usando <i>Animation Window</i> y <i>Animator</i>, sin escribir código.',
      'Propusimos una primera idea de proyecto final aplicando GameObjects, jerarquías y prefabs.'
    ],
    codigo: [],
    resultados: [
      'Unity resuelve movimientos cíclicos completos con keyframes y curvas de animación: el movimiento no siempre necesita vivir en un script.',
      'Organizar bien la jerarquía desde el inicio facilita animar: al rotar el padre (la rueda) todas las cabinas giran con ella.'
    ],
    imagenes: []
  },

  /* ------------------------------------------------------------- P2 */
  {
    id: 'p2',
    numero: 'Práctica 2',
    titulo: 'Objetos y Scripts: el Cañón Autónomo',
    resumen:
      'Introducción a C# en Unity. Programamos un cañón que instancia balas físicas con Rigidbody que se autodestruyen a los 3 segundos, y le agregamos una interfaz con contador de munición.',
    etiquetas: ['C#', 'Instantiate', 'Destroy', 'Rigidbody', 'Canvas', 'TextMeshPro'],
    video: { src: 'assets/videos/practica-canon.webm', tipo: 'video/webm' },
    objetivo:
      'Entender qué formatos de modelos 3D son ideales para Unity y dar el primer paso en programación orientada a objetos con C#.',
    conceptos: [
      ['Formatos de intercambio', 'FBX soporta malla, materiales, rig y animaciones (personajes). OBJ es simple, sin huesos ni animaciones (objetos estáticos).'],
      ['Formatos nativos', '.blend, Maya y 3ds Max: Unity los convierte a FBX en segundo plano al importarlos.'],
      ['Variables', '<code>public</code> aparece en el Inspector y se puede ajustar sin tocar código; <code>private</code> solo la ve el script. Tipos: int, float, bool, string, GameObject.'],
      ['Funciones', '<code>void</code> ejecuta una tarea sin devolver resultado; los argumentos son los datos que necesita.'],
      ['GetComponent', 'Permite que un script hable con otro componente del mismo objeto.'],
      ['Instantiate / Destroy', 'Crear copias de un prefab (balas, enemigos) y eliminarlas de memoria cuando ya no se necesitan.']
    ],
    pasos: [
      '<b>Prefab de la bala:</b> esfera de escala 0.2, con <b>Rigidbody</b> y un material propio; la guardamos como prefab y la borramos de la escena.',
      '<b>Script Bala:</b> lo añadimos al prefab para que la bala se destruya sola a los 3 segundos y no llene la memoria.',
      '<b>Cañón:</b> un cilindro rotado 90° en X llamado <code>Cañon</code>, con un <i>Empty</i> hijo en la punta llamado <code>PuntoDisparo</code> (para que la bala no nazca dentro del cañón).',
      '<b>Script ControlCañon:</b> al hacer clic instancia la bala en <code>PuntoDisparo</code> y le aplica una fuerza hacia adelante.',
      '<b>Conexión en el Inspector:</b> arrastramos el prefab a <i>Prefab Bala</i>, <code>PuntoDisparo</code> a <i>Punto Salida</i> y probamos con <i>Fuerza Disparo</i> = 1000.',
      '<b>Interfaz:</b> agregamos un <b>Canvas</b> con un contador de munición en TextMeshPro y un botón <b>“¡FUEGO!”</b> conectado a <code>Disparar()</code> mediante <i>On Click()</i>.'
    ],
    codigo: [
      {
        archivo: 'Bala.cs',
        nota: 'Se añade al prefab de la bala.',
        texto: `using UnityEngine;

public class Bala : MonoBehaviour
{
    // Una variable pública para ajustar el tiempo desde el editor
    public float tiempoDeVida = 3.0f;

    void Start()
    {
        // Destroy tiene un segundo argumento opcional: el tiempo de espera
        Destroy(gameObject, tiempoDeVida);
    }
}`
      },
      {
        archivo: 'ControlCañon.cs',
        nota: 'Se añade al objeto Cañon.',
        texto: `using UnityEngine;

public class ControlCañon : MonoBehaviour
{
    // VARIABLES PÚBLICAS (Se verán en el Inspector)
    public GameObject prefabBala;    // ¿Qué disparamos?
    public Transform puntoSalida;    // ¿Desde dónde sale?
    public float fuerzaDisparo = 500f; // ¿Con qué fuerza?

    void Update()
    {
        // Si pulsamos clic izquierdo (0)
        if (Input.GetMouseButtonDown(0))
        {
            Disparar();
        }
    }

    void Disparar()
    {
        // 1. Crear la bala (Qué, Dónde, Con qué rotación)
        GameObject nuevaBala = Instantiate(prefabBala, puntoSalida.position, puntoSalida.rotation);

        // 2. Obtener el Rigidbody de ESA bala nueva
        Rigidbody rbBala = nuevaBala.GetComponent<Rigidbody>();

        // 3. Empujarla hacia adelante
        rbBala.AddForce(puntoSalida.forward * fuerzaDisparo);
    }
}`
      }
    ],
    resultados: [
      'Al dar Play y hacer clic, las esferas salen disparadas físicamente; a los 3 segundos desaparecen de la Jerarquía.',
      'Aprendimos a conectar la escena (cañón y física) con la interfaz (Canvas) arrastrando referencias en el Inspector y usando eventos <i>On Click()</i>, sin acoplar el código de uno con el otro.'
    ],
    imagenes: []
  },

  /* ------------------------------------------------------------- P3 */
  {
    id: 'p3',
    numero: 'Práctica 3',
    titulo: 'Físicas: Rigidbody, Gravedad y Colisiones',
    resumen:
      'Dos sesiones de física. Primero analizamos masa, gravedad y resistencia en una escena de caída; después construimos una pista con obstáculos y detectamos colisiones con C#.',
    etiquetas: ['Rigidbody', 'Gravedad', 'Colliders', 'OnCollisionEnter', 'Discrete vs Continuous'],
    video: null,
    objetivo:
      'Comprender cómo participa un objeto en la simulación física de Unity (sesión 1) y configurar superficies físicas para detectar contactos entre objetos (sesión 2).',
    conceptos: [
      ['Transform · Collider · Rigidbody · Script', 'El Collider define el volumen de contacto; el Rigidbody deja que el motor físico controle gravedad, velocidad, fuerzas e impactos; el Script define la respuesta.'],
      ['Propiedades del Rigidbody', '<b>Mass</b>, <b>Use Gravity</b>, <b>Is Kinematic</b> (ignora fuerzas y gravedad), <b>Drag</b> (resistencia), <b>Constraints</b> (bloquea ejes) y <b>Collision Detection</b>.'],
      ['Tipos de Collider', 'Box (cajas, paredes), Sphere (pelotas), Capsule (personajes) y Mesh (geometría irregular, más costoso). Regla: usar la forma más sencilla que represente el contacto.'],
      ['Discrete vs Continuous', 'Discrete consume menos recursos; Continuous evita que un objeto muy rápido atraviese una superficie (<i>tunneling</i>).']
    ],
    pasos: [
      '<b>Sesión 1 · Escena de caída:</b> creamos un plano con Collider y tres objetos a distintas alturas, todos con Rigidbody.',
      '<b>Experimento de masa:</b> tres cubos iguales a la misma altura con masas de 1, 10 y 100. Antes de ejecutar escribimos nuestra hipótesis.',
      'Modificamos <b>Mass</b>, <b>Drag</b> e <b>Is Kinematic</b> y registramos lo observado. Guardamos la escena como <code>Fisica_Sesion1</code>.',
      '<b>Sesión 2 · Pista con obstáculos:</b> piso, rampa inclinada, dos paredes laterales y tres obstáculos, todos con Collider.',
      'Colocamos una pelota con <b>Sphere Collider</b> y <b>Rigidbody</b>; como prueba desactivamos el Collider del piso para ver cómo la pelota lo atraviesa.',
      'Añadimos el script <code>DetectorColision</code> a la pelota para registrar cada choque en la consola.',
      'Aumentamos la velocidad de la pelota y comparamos los modos <b>Discrete</b> y <b>Continuous</b>.'
    ],
    codigo: [
      {
        archivo: 'DetectorColision.cs',
        nota: 'Se añade a la pelota; cada choque aparece en la Consola.',
        texto: `using UnityEngine;

public class DetectorColision : MonoBehaviour
{
    private void OnCollisionEnter(Collision collision)
    {
        Debug.Log("Colisión con: " + collision.gameObject.name);
    }
}`
      }
    ],
    resultados: [
      'Los tres cubos (masa 1, 10 y 100) caen al mismo tiempo: la masa cambia la respuesta ante una fuerza o un impacto, pero no la velocidad de caída por gravedad.',
      'Con <b>Is Kinematic</b> activado el objeto deja de responder a la gravedad y a las fuerzas; con <b>Drag</b> alto la caída se frena.',
      'Sin Collider en el piso la pelota lo atraviesa: el Rigidbody necesita un Collider para chocar.',
      'A alta velocidad, en modo Discrete la pelota puede atravesar paredes delgadas; en Continuous el choque se detecta correctamente.'
    ],
    imagenes: []
  },

  /* ------------------------------------------------------------- P4 */
  {
    id: 'p4',
    numero: 'Práctica 4',
    titulo: 'Conexión y Navegación de Escenas',
    resumen:
      'Estructuramos el flujo del proyecto conectando tres escenas (Inicio, Actividad 1 y Actividad 2) con SceneManager y los eventos On Click() de los botones.',
    etiquetas: ['SceneManager', 'Build Settings', 'UI Button', 'On Click()'],
    video: null,
    objetivo:
      'Conectar varias escenas de Unity para que el usuario pueda navegar entre ellas desde la interfaz.',
    conceptos: [
      ['SceneManager', 'Clase de <code>UnityEngine.SceneManagement</code> que carga escenas por nombre con <code>LoadScene()</code>.'],
      ['Scenes In Build', 'Solo se pueden cargar las escenas agregadas en <i>File → Build Settings</i>.'],
      ['Eventos On Click()', 'Un botón de UI puede llamar a cualquier función pública de un script sin escribir código extra.']
    ],
    pasos: [
      'Creamos y guardamos tres escenas: <code>Inicio</code>, <code>Actividad1</code> y <code>Actividad2</code>.',
      'Las agregamos en <i>File → Build Settings → Scenes In Build</i>.',
      'En cada escena creamos un objeto vacío llamado <code>Navegador</code> y le asignamos el script <code>NavegacionEscenas</code>.',
      'En cada botón buscamos <i>On Click()</i> en el Inspector, pulsamos <b>+</b> y arrastramos <code>Navegador</code>.',
      'Elegimos la función correspondiente, por ejemplo <code>NavegacionEscenas → IrAActividad1()</code>, y repetimos con los demás botones.'
    ],
    codigo: [
      {
        archivo: 'NavegacionEscenas.cs',
        nota: 'Se añade al objeto vacío Navegador de cada escena.',
        texto: `using UnityEngine;
using UnityEngine.SceneManagement;

public class NavegacionEscenas : MonoBehaviour
{
    public void IrAInicio()
    {
        SceneManager.LoadScene("Inicio");
    }

    public void IrAActividad1()
    {
        SceneManager.LoadScene("Actividad1");
    }

    public void IrAActividad2()
    {
        SceneManager.LoadScene("Actividad2");
    }
}`
      }
    ],
    resultados: [
      'Desde cualquier escena se puede ir a las otras dos con un botón.',
      'Si una escena no está en <i>Scenes In Build</i>, <code>LoadScene</code> marca error: hay que registrarla antes.',
      'Es el mismo patrón que usa ARGOS para separar el menú de la navegación.'
    ],
    imagenes: []
  },

  /* ------------------------------------------------------------- P5 */
  {
    id: 'p5',
    numero: 'Práctica 5',
    titulo: 'Colisiones y Triggers: la Nave y el Agujero Negro',
    resumen:
      'Una nave que controlamos con botones de flecha atraviesa un agujero negro; al tocarlo, un trigger hace aparecer planetas y asteroides en la escena.',
    etiquetas: ['Triggers', 'OnTriggerEnter', 'HashSet', 'Rigidbody.MovePosition', 'UI Buttons'],
    video: { src: 'assets/videos/collisions.mp4', tipo: 'video/mp4' },
    objetivo:
      'Entender el comportamiento de dos objetos al interactuar y cómo ese contacto puede desencadenar otra acción en la escena.',
    conceptos: [
      ['Collider vs Trigger', 'Un Collider con <i>Is Trigger</i> no frena al otro objeto, solo avisa que entró (<code>OnTriggerEnter</code>) o salió (<code>OnTriggerExit</code>).'],
      ['Activador', 'El script vacío <code>ActivadorBoton</code> funciona como etiqueta: solo los objetos que lo tienen pueden activar el trigger.'],
      ['Contactos sin repetir', 'Un <code>HashSet&lt;Collider&gt;</code> evita contar dos veces el mismo collider y que la acción se dispare varias veces.'],
      ['Movimiento físico', '<code>Rigidbody.MovePosition</code> dentro de <code>FixedUpdate</code> mueve un objeto cinemático respetando el motor de física.']
    ],
    pasos: [
      'Creamos tres elementos: la <b>nave</b>, el <b>agujero negro</b> y el grupo de <b>planetas y asteroides</b> (inicialmente desactivado).',
      'A la nave le pusimos <code>ActivadorBoton</code> (el elemento que hace el acercamiento) y <code>MoverPulsador</code>.',
      'Al agujero negro le pusimos un <b>Box Collider</b> y <code>BotonPorContacto</code>, y arrastramos el grupo de planetas al campo <i>Objeto Objetivo</i>.',
      'Creamos un Canvas con cuatro botones (<b>Arriba, Abajo, Izq, Der</b>) y los arrastramos a los campos de <code>MoverPulsador</code>.',
      'Al dar Play movemos la nave con los botones; cuando entra al agujero negro se activan los planetas y asteroides y la consola muestra “¡Botón presionado!”.'
    ],
    codigo: [
      {
        archivo: 'ActivadorBoton.cs',
        nota: 'Se coloca en el elemento que hará el acercamiento (la nave).',
        texto: `using UnityEngine;

public class ActivadorBoton : MonoBehaviour
{
}`
      },
      {
        archivo: 'BotonPorContacto.cs',
        nota: 'Se coloca en el agujero negro; activa o desactiva el objeto objetivo.',
        texto: `using System.Collections.Generic;
using UnityEngine;

[RequireComponent(typeof(BoxCollider))]
public class BotonPorContacto : MonoBehaviour
{
    [SerializeField] private GameObject objetoObjetivo;

    private readonly HashSet<Collider> contactos = new HashSet<Collider>();

    private void Awake()
    {
        GetComponent<BoxCollider>().isTrigger = true;
    }

    private void OnTriggerEnter(Collider other)
    {
        // Ignora objetos que no sean activadores.
        if (other.GetComponentInParent<ActivadorBoton>() == null)
            return;

        // Evita registrar dos veces el mismo collider.
        if (!contactos.Add(other))
            return;

        // Solo activa al pasar de ningún contacto a uno.
        if (contactos.Count == 1)
            Presionar();
    }

    private void OnTriggerExit(Collider other)
    {
        contactos.Remove(other);
    }

    private void Presionar()
    {
        Debug.Log("¡Botón presionado!", this);

        if (objetoObjetivo != null)
        {
            objetoObjetivo.SetActive(!objetoObjetivo.activeSelf);
        }
    }

    private void OnDisable()
    {
        contactos.Clear();
    }
}`
      },
      {
        archivo: 'MoverPulsador.cs',
        nota: 'Se coloca en la nave; la mueve con los botones de flecha.',
        texto: `using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(Rigidbody))]
public class MoverPulsador : MonoBehaviour
{
    [SerializeField] private Button botonArriba;
    [SerializeField] private Button botonAbajo;
    [SerializeField] private Button botonIzquierda;
    [SerializeField] private Button botonDerecha;
    [SerializeField] private float paso = 0.05f;

    private Rigidbody rb;
    private Vector3 movimientoPendiente;

    private void Awake()
    {
        rb = GetComponent<Rigidbody>();
        rb.useGravity = false;
        rb.isKinematic = true;
    }

    private void Start()
    {
        botonArriba.onClick.AddListener(Arriba);
        botonAbajo.onClick.AddListener(Abajo);
        botonIzquierda.onClick.AddListener(Izquierda);
        botonDerecha.onClick.AddListener(Derecha);
    }

    public void Arriba()    { movimientoPendiente += Vector3.up * paso; }
    public void Abajo()     { movimientoPendiente += Vector3.down * paso; }
    public void Izquierda() { movimientoPendiente += Vector3.left * paso; }
    public void Derecha()   { movimientoPendiente += Vector3.right * paso; }

    private void FixedUpdate()
    {
        if (movimientoPendiente == Vector3.zero)
            return;

        rb.MovePosition(rb.position + movimientoPendiente);
        movimientoPendiente = Vector3.zero;
    }

    private void OnDestroy()
    {
        if (botonArriba != null) botonArriba.onClick.RemoveListener(Arriba);
        if (botonAbajo != null) botonAbajo.onClick.RemoveListener(Abajo);
        if (botonIzquierda != null) botonIzquierda.onClick.RemoveListener(Izquierda);
        if (botonDerecha != null) botonDerecha.onClick.RemoveListener(Derecha);
    }
}`
      }
    ],
    resultados: [
      'Al entrar la nave al agujero negro aparecen los planetas y asteroides: un contacto físico dispara una acción en la escena.',
      'El trigger solo responde a objetos con <code>ActivadorBoton</code>, así que otros objetos que lo toquen no lo activan.',
      'Este mismo patrón (zona trigger que dispara un evento) es el que ARGOS usa para detectar la llegada a un punto de la ruta.'
    ],
    imagenes: []
  },

  /* ------------------------------------------------------------- P6 */
  {
    id: 'p6',
    numero: 'Práctica 6',
    titulo: 'Conectividad IoT con MQTT en Realidad Mixta',
    resumen:
      'Comunicación en tiempo real entre Unity (Meta Quest 3S) y otros dispositivos por MQTT: seis figuras que cambian de color al tocarlas y un carro omnidireccional controlado a distancia.',
    etiquetas: ['MQTT', 'MQTTnet', 'Mosquitto', 'MQTT Explorer', 'Realidad Mixta', 'Three.js'],
    video: null,
    objetivo:
      'Integrar comunicación en tiempo real por el protocolo MQTT en una experiencia de realidad mixta en Unity.',
    conceptos: [
      ['MQTT', 'Protocolo ligero publicar/suscribir: los clientes publican mensajes en un <i>topic</i> y todos los suscritos a ese topic los reciben a través de un broker.'],
      ['MQTTnet + NuGetForUnity', 'Instalamos Git, luego NuGetForUnity desde <i>Package Manager → Add package from git URL</i> y, con él, <b>MQTTnet 4.3.7.1207</b>.'],
      ['Broker Mosquitto', 'Servidor MQTT instalado en la PC con un <code>broker.conf</code> propio (puerto 1883 para Unity y MQTT Explorer, 9001 WebSockets para la web).'],
      ['Hilos y Update()', 'Los mensajes llegan en otro hilo; se guardan en una <code>ConcurrentQueue</code> y se muestran desde <code>Update()</code>, que corre en el hilo principal de Unity.']
    ],
    pasos: [
      'Instalamos <b>Git</b> (opción “from the command line and also from 3rd-party software”) y <b>NuGetForUnity</b>; desde <i>NuGet → Manage NuGet Packages</i> instalamos <b>MQTTnet 4.3.7.1207</b>.',
      'Instalamos <b>Mosquitto</b>, creamos <code>C:\\mqtt-clase\\broker.conf</code>, detuvimos el servicio con <code>net stop mosquitto</code> y lo arrancamos con nuestra configuración.',
      'Creamos <code>MQTTBasico.cs</code> en un objeto vacío <code>MQTT_Manager</code>, conectamos un TextMeshPro y un botón con <i>On Click() → Publicar()</i>.',
      'Verificamos los mensajes en <b>MQTT Explorer</b> (host <code>test.mosquitto.org</code>, puerto 1883, topic <code>clase/te/quest3/texto</code>).',
      '<b>Ejercicio 1:</b> escena de realidad mixta con 3 figuras geométricas y 3 complejas; al tocarlas cambian de color y publican por MQTT qué figura se tocó y de qué color quedó, visible en un texto flotante y en MQTT Explorer.',
      '<b>Ejercicio 2:</b> carro omnidireccional en realidad mixta que recibe por MQTT movimientos en 8 direcciones, rotación, faros y direccionales.',
      '<b>Nuestra adaptación (Ciencia de Datos):</b> en lugar del ESP32 físico hicimos una <b>Web App</b> que funciona como control del carro, espejo 3D en tiempo real (Three.js) de las figuras y el carro, y dashboard con KPIs (moda de figuras y colores, eventos/min, odometría) exportable a CSV y JSON.'
    ],
    codigo: [
      {
        archivo: 'broker.conf',
        nota: 'Configuración de Mosquitto en C:\\mqtt-clase (TCP para Unity + WebSockets para la Web App).',
        texto: `# 1. Puerto TCP estándar (1883) -> Unity (MQTTnet) y MQTT Explorer
listener 1883 0.0.0.0
protocol mqtt

# 2. Puerto WebSockets (9001) -> Web App en celular / navegador (mqtt.js)
listener 9001 0.0.0.0
protocol websockets

allow_anonymous true
persistence false
log_dest stdout`
      },
      {
        archivo: 'Arrancar el broker (CMD como administrador)',
        nota: '',
        texto: `net stop mosquitto
"C:\\Program Files\\mosquitto\\mosquitto.exe" -c "C:\\mqtt-clase\\broker.conf" -v`
      },
      {
        archivo: 'MQTTBasico.cs',
        nota: 'Se añade a un objeto vacío MQTT_Manager. El botón llama a Publicar().',
        texto: `using System;
using System.Collections.Concurrent;
using System.Threading.Tasks;
using MQTTnet;
using MQTTnet.Client;
using TMPro;
using UnityEngine;

public class MQTTBasico : MonoBehaviour
{
    // Texto de la escena donde veremos los mensajes.
    public TMP_Text textoRecibido;
    // Todos los participantes deben usar el mismo topic.
    public string topic = "clase/te/quest3/texto";
    // Mensaje que enviará el botón.
    public string mensaje = "Hola desde Unity";

    private IMqttClient cliente;
    // Guarda los mensajes para mostrarlos desde Update.
    private readonly ConcurrentQueue<string> mensajes = new ConcurrentQueue<string>();

    private async void Start()
    {
        try
        {
            // 1. Crear el cliente MQTT.
            cliente = new MqttFactory().CreateMqttClient();

            // 2. Definir qué hacer cuando llegue un mensaje.
            cliente.ApplicationMessageReceivedAsync += e =>
            {
                mensajes.Enqueue(e.ApplicationMessage.ConvertPayloadToString());
                return Task.CompletedTask;
            };

            // 3. Configurar el servidor y un identificador único.
            var opciones = new MqttClientOptionsBuilder()
                .WithTcpServer("test.mosquitto.org", 1883)
                .WithClientId("Unity_" + Guid.NewGuid())
                .Build();

            // 4. Conectarse al servidor.
            await cliente.ConnectAsync(opciones);
            if (this == null) return;

            // 5. Suscribirse para recibir mensajes del topic.
            var suscripcion = new MqttClientSubscribeOptionsBuilder()
                .WithTopicFilter(topic)
                .Build();
            await cliente.SubscribeAsync(suscripcion);

            if (this != null)
                Debug.Log("MQTT conectado y suscrito");
        }
        catch (Exception error)
        {
            Debug.LogError("Error MQTT: " + error.Message);
        }
    }

    public async void Publicar()
    {
        // Solo publicar si existe una conexión.
        if (cliente == null || !cliente.IsConnected) return;

        try
        {
            // 6. Preparar y publicar el mensaje.
            var envio = new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(mensaje)
                .Build();
            await cliente.PublishAsync(envio);
        }
        catch (Exception error)
        {
            Debug.LogError("Error al publicar: " + error.Message);
        }
    }

    private void Update()
    {
        // 7. Mostrar el mensaje recibido en Unity.
        if (mensajes.TryDequeue(out string recibido))
        {
            if (textoRecibido != null)
                textoRecibido.text = recibido;
        }
    }

    private void OnDestroy()
    {
        // Liberar la conexión al salir de la escena.
        cliente?.Dispose();
    }
}`
      }
    ],
    resultados: [
      'Unity publica y recibe mensajes en tiempo real; MQTT Explorer muestra cada evento en el topic <code>clase/te/quest3/texto</code>.',
      'La escena final (<code>Practica_MR_MQTT_Completa</code>) reúne el texto flotante, las 6 figuras, el carro omnidireccional y el <code>MQTT_Manager</code>.',
      'Usamos tres topics: <code>clase/te/quest3/texto</code>, <code>clase/te/quest3/figuras</code> y <code>clase/te/quest3/carro</code>.',
      'Esta práctica es la base de la conectividad de ARGOS: mandar eventos del visor a otros dispositivos y analizarlos como datos.'
    ],
    imagenes: [
      { src: 'assets/img/practicas/p6-1.jpg', pie: 'Escena en Unity: texto flotante, las 6 figuras interactivas y el carro omnidireccional.' }
    ]
  }
];

/* =====================================================================
   Render
   ===================================================================== */
(function () {
  const grid = document.getElementById('practicasGrid');
  const modal = document.getElementById('practicaModal');
  const body = document.getElementById('practicaBody');
  if (!grid || !modal || !body) return;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Tarjetas ---------- */
  grid.innerHTML = PRACTICAS.map((p) => {
    const portada = p.video
      ? `<video class="h-52 w-full object-cover" autoplay muted loop playsinline preload="metadata"><source src="${p.video.src}" type="${p.video.tipo}"></video>`
      : p.imagenes.length
        ? `<img class="h-52 w-full object-cover" src="${p.imagenes[0].src}" alt="" loading="lazy">`
        : `<div class="flex h-52 w-full items-center justify-center bg-gradient-to-br from-slate-900 to-[#3a0010]"><span class="font-[Montserrat] text-6xl font-extrabold text-white/90">${p.numero.replace('Práctica ', '')}</span></div>`;
    return `
      <a href="#${p.id}" class="feature-card card-hover group flex flex-col overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#DC0235]" aria-label="Ver detalle de ${esc(p.numero)}: ${esc(p.titulo)}">
        ${portada}
        <div class="flex flex-1 flex-col p-6">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">${p.numero}</p>
          <h3 class="mt-4 text-2xl font-bold text-slate-900">${p.titulo}</h3>
          <p class="mt-4 flex-1 leading-7 text-slate-600">${p.resumen}</p>
          <span class="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#DC0235]">
            Ver práctica completa
            <svg class="h-4 w-4 transition group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </span>
        </div>
      </a>`;
  }).join('');

  /* ---------- Detalle ---------- */
  const seccion = (titulo, html) => `
    <section class="mt-10">
      <h3 class="text-xs font-bold uppercase tracking-[0.2em] text-[#DC0235]">${titulo}</h3>
      <div class="mt-4">${html}</div>
    </section>`;

  function detalle(p) {
    const i = PRACTICAS.indexOf(p);
    const prev = PRACTICAS[i - 1];
    const next = PRACTICAS[i + 1];

    const media = [];
    if (p.video) {
      media.push(`<video class="w-full rounded-2xl bg-black" controls playsinline preload="metadata"><source src="${p.video.src}" type="${p.video.tipo}"></video>`);
    }

    const galeria = p.imagenes.length
      ? `<div class="grid gap-4 ${p.imagenes.length > 1 ? 'sm:grid-cols-2' : ''}">${p.imagenes.map((im) => `
          <figure>
            <a href="${im.src}" target="_blank" rel="noopener"><img src="${im.src}" alt="${esc(im.pie || '')}" loading="lazy" class="w-full rounded-2xl border border-slate-200"></a>
            ${im.pie ? `<figcaption class="mt-2 text-sm text-slate-500">${im.pie}</figcaption>` : ''}
          </figure>`).join('')}</div>`
      : '';

    const conceptos = `<dl class="grid gap-4 sm:grid-cols-2">${p.conceptos.map(([t, d]) => `
        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <dt class="font-semibold text-slate-900">${t}</dt>
          <dd class="mt-2 text-sm leading-6 text-slate-600">${d}</dd>
        </div>`).join('')}</dl>`;

    const pasos = `<ol class="space-y-4">${p.pasos.map((s, n) => `
        <li class="flex gap-4">
          <span class="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">${n + 1}</span>
          <p class="pt-1 leading-7 text-slate-700">${s}</p>
        </li>`).join('')}</ol>`;

    const codigo = p.codigo.map((c, n) => `
        <div class="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-[#0b1220]">
          <div class="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-2">
            <div>
              <p class="font-mono text-sm font-semibold text-white">${esc(c.archivo)}</p>
              ${c.nota ? `<p class="text-xs text-slate-400">${esc(c.nota)}</p>` : ''}
            </div>
            <button type="button" data-copiar="${n}" class="flex-none rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10">Copiar</button>
          </div>
          <pre class="max-h-[420px] overflow-auto p-4 text-[13px] leading-6 text-slate-200"><code>${esc(c.texto)}</code></pre>
        </div>`).join('');

    const resultados = `<ul class="space-y-3">${p.resultados.map((r) => `
        <li class="flex gap-3 leading-7 text-slate-700">
          <svg class="mt-1.5 h-4 w-4 flex-none text-[#DC0235]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
          <span>${r}</span>
        </li>`).join('')}</ul>`;

    const nav = `
      <div class="mt-12 flex items-center justify-between gap-4 border-t border-slate-200 pt-6 text-sm font-semibold">
        ${prev ? `<a href="#${prev.id}" class="text-slate-600 hover:text-slate-900">← ${prev.numero}</a>` : '<span></span>'}
        ${next ? `<a href="#${next.id}" class="text-slate-600 hover:text-slate-900">${next.numero} →</a>` : '<span></span>'}
      </div>`;

    body.innerHTML = `
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">${p.numero}</p>
      <h2 id="practicaTitulo" class="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">${p.titulo}</h2>
      <div class="mt-4 flex flex-wrap gap-2">${p.etiquetas.map((t) => `<span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">${esc(t)}</span>`).join('')}</div>
      <p class="mt-6 text-lg leading-8 text-slate-600">${p.resumen}</p>
      ${media.length ? `<div class="mt-8">${media.join('')}</div>` : ''}
      ${seccion('Objetivo', `<p class="leading-7 text-slate-700">${p.objetivo}</p>`)}
      ${seccion('Conceptos clave', conceptos)}
      ${seccion('Qué hicimos, paso a paso', pasos)}
      ${p.codigo.length ? seccion('Código', codigo) : ''}
      ${galeria ? seccion('Capturas', galeria) : ''}
      ${seccion('Resultados y aprendizajes', resultados)}
      ${nav}`;

    body.querySelectorAll('[data-copiar]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const texto = p.codigo[+btn.dataset.copiar].texto;
        try {
          await navigator.clipboard.writeText(texto);
          btn.textContent = '¡Copiado!';
        } catch {
          btn.textContent = 'No se pudo copiar';
        }
        setTimeout(() => (btn.textContent = 'Copiar'), 1600);
      });
    });
  }

  /* ---------- Abrir / cerrar según el #hash ---------- */
  let ultimoFoco = null;

  function abrir(p) {
    if (modal.hidden) ultimoFoco = document.activeElement;
    detalle(p);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-scroll]').scrollTop = 0;
    modal.querySelector('[data-cerrar]').focus({ preventScroll: true });
  }

  function cerrar() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = '';
    body.querySelectorAll('video').forEach((v) => v.pause());
    body.innerHTML = '';
    if (ultimoFoco) ultimoFoco.focus({ preventScroll: true });
  }

  function sincronizar() {
    const p = PRACTICAS.find((x) => '#' + x.id === location.hash);
    if (p) abrir(p);
    else cerrar();
  }

  function salir() {
    // Quita el #pN sin dejar una entrada extra en el historial
    history.replaceState(null, '', location.pathname + location.search + '#practicas');
    cerrar();
  }

  modal.querySelectorAll('[data-cerrar]').forEach((el) => el.addEventListener('click', salir));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) salir();
  });
  window.addEventListener('hashchange', sincronizar);
  sincronizar();
})();
