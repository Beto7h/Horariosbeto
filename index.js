const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;

if (!token || !chatId) {
  console.error("Faltan las variables BOT_TOKEN o CHAT_ID");
  process.exit(1);
}

const bot = new Telegraf(token);

// Archivo para guardar la configuración de forma persistente
const CONFIG_FILE = path.join(__dirname, 'config.json');

let config = {
  timezone: 'America/Mexico_City',
  horaCierre: '23:00', 
  horaApertura: '07:00' 
};

// Cargar configuración guardada si existe
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(data);
    console.log("Configuración cargada:", config);
  } catch (e) {
    console.error("Error al leer config.json:", e);
  }
}

function guardarConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Control de estados para usuarios configurando horas interactivas
const usuariosEsperandoInput = {};

// Servidor web para Koyeb (mantiene el bot activo)
const port = process.env.PORT || 8000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot de horarios activo');
}).listen(port, () => {
  console.log(`Servidor web escuchando en puerto ${port}`);
});

// Funciones para abrir y cerrar el grupo con mensajes alegres y llamativos
async function cerrarGrupo() {
  try {
    await bot.telegram.setChatPermissions(chatId, {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    });
    
    const mensaje = `🌙✨ **¡LLEGÓ LA HORA DE DESCANSAR!** ✨🌙\n\n🛑 **¡Atención a todos!** El grupo se ha cerrado oficialmente por el modo nocturno.\n\n🔒 *A partir de este momento, no se pueden enviar mensajes ni fotos en el grupo.*\n\n☀️ Nos vemos mañana a las **${config.horaApertura} hrs** para seguir cotorreando. ¡Que descansen! 💤💙`;
    await bot.telegram.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    console.log("Grupo cerrado correctamente.");
  } catch (error) {
    console.error("Error al cerrar el grupo:", error);
  }
}

async function abrirGrupo() {
  try {
    await bot.telegram.setChatPermissions(chatId, {
      can_send_messages: true,
      can_send_media_messages: true,
      can_send_polls: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true
    });
    
    const mensaje = `🌅🎉 **¡BUENOS DÍAS, GRUPO!** 🎉🌅\n\n🔓 **¡El descanso terminó!** El grupo ya se encuentra abierto nuevamente.\n\n💬 ¡Ya pueden enviar mensajes, fotos y reportarse con toda la actitud!\n\n🚀 ¡Que tengan un excelente día! ✨`;
    await bot.telegram.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    console.log("Grupo abierto correctamente.");
  } catch (error) {
    console.error("Error al abrir el grupo:", error);
  }
}

// Variables globales para las tareas de cron
let tareaCierre = null;
let tareaApertura = null;

function programarTareas() {
  if (tareaCierre) tareaCierre.stop();
  if (tareaApertura) tareaApertura.stop();

  const [horaC, minC] = config.horaCierre.split(':');
  const [horaA, minA] = config.horaApertura.split(':');

  const cronCierreExpr = `${minC} ${horaC} * * *`;
  const cronAperturaExpr = `${minA} ${horaA} * * *`;

  tareaCierre = cron.schedule(cronCierreExpr, () => {
    cerrarGrupo();
  }, { timezone: config.timezone });

  tareaApertura = cron.schedule(cronAperturaExpr, () => {
    abrirGrupo();
  }, { timezone: config.timezone });

  console.log(`Tareas programadas - Zona: ${config.timezone} | Cierre: ${config.horaCierre} | Apertura: ${config.horaApertura}`);
}

programarTareas();

// Función auxiliar para convertir formato 12h (ej. "7" o "11:30") + AM/PM a formato 24h ("07:00" o "23:30")
function convertirA24h(hora12, ampm) {
  let [h, m] = hora12.split(':');
  let horaNum = parseInt(h);
  let minStr = m || '00';
  
  if (ampm === 'PM' && horaNum < 12) horaNum += 12;
  if (ampm === 'AM' && horaNum === 12) horaNum = 0;
  
  let horaStr = horaNum.toString().padStart(2, '0');
  return `${horaStr}:${minStr}`;
}

// ---------------------------------------------------------
// MENÚS Y COMANDOS INTERACTIVOS
// ---------------------------------------------------------

bot.command('configurar', (ctx) => {
  delete usuariosEsperandoInput[ctx.from.id];
  
  ctx.reply(
    '⚙️ **Panel Principal de Configuración**\n\n¿Qué te gustaría ajustar hoy?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Personalizar Horarios (12h)', 'menu_horarios')]
      ])
    }
  );
});

// Menú de Zonas Horarias
bot.action('menu_paises', (ctx) => {
  ctx.editMessageText(
    '🌍 **Selecciona tu país:**',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🇲🇽 México', 'pais_mexico')],
        [Markup.button.callback('🇦🇷 Argentina', 'pais_argentina')],
        [Markup.button.callback('🇪🇸 España', 'pais_espana')],
        [Markup.button.callback('🇨🇴 Colombia', 'pais_colombia')],
        [Markup.button.callback('⬅️ Volver al Menú Principal', 'volver_menu')]
      ])
    }
  );
});

bot.action('pais_mexico', (ctx) => {
  ctx.editMessageText('🇲🇽 **México** - Selecciona tu región:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Centro / CDMX', 'tz_America/Mexico_City')],
      [Markup.button.callback('Tijuana', 'tz_America/Tijuana')],
      [Markup.button.callback('Cancún', 'tz_America/Cancun')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('pais_argentina', (ctx) => {
  ctx.editMessageText('🇦🇷 **Argentina**:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Buenos Aires', 'tz_America/Argentina/Buenos_Aires')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('pais_espana', (ctx) => {
  ctx.editMessageText('🇪🇸 **España**:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Madrid / Málaga', 'tz_Europe/Madrid')],
      [Markup.button.callback('Islas Canarias', 'tz_Atlantic/Canary')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('pais_colombia', (ctx) => {
  ctx.editMessageText('🇨🇴 **Colombia**:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Bogotá', 'tz_America/Bogota')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

// Menú de Horarios
bot.action('menu_horarios', (ctx) => {
  delete usuariosEsperandoInput[ctx.from.id];
  ctx.editMessageText(
    `🕒 **Configuración de Horarios**\n\n🌙 Cierre actual: \`${config.horaCierre}\`\n☀️ Apertura actual: \`${config.horaApertura}\`\n\n¿Qué hora deseas modificar?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌙 Cambiar Hora de Cierre', 'pedir_cierre')],
        [Markup.button.callback('☀️ Cambiar Hora de Apertura', 'pedir_apertura')],
        [Markup.button.callback('⬅️ Volver al Menú Principal', 'volver_menu')]
      ])
    }
  );
});

// Solicitar hora de cierre
bot.action('pedir_cierre', (ctx) => {
  usuariosEsperandoInput[ctx.from.id] = { tipo: 'cierre', esperandoAMPM: false };
  ctx.editMessageText(
    '🌙 **Modo Cierre (Modo Noche)**\n\nEscribe la hora numérica del 1 al 12 (puedes incluir minutos como `11` o `11:30`).\n\n*(Escribe el número directamente en el chat)*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Volver', 'menu_horarios')]
      ])
    }
  );
});

// Solicitar hora de apertura
bot.action('pedir_apertura', (ctx) => {
  usuariosEsperandoInput[ctx.from.id] = { tipo: 'apertura', esperandoAMPM: false };
  ctx.editMessageText(
    '☀️ **Modo Apertura (Mañana)**\n\nEscribe la hora numérica del 1 al 12 (puedes incluir minutos como `7` o `7:30`).\n\n*(Escribe el número directamente en el chat)*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Volver', 'menu_horarios')]
      ])
    }
  );
});

// Capturar texto de hora y luego mostrar botones AM / PM
bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const estado = usuariosEsperandoInput[userId];

  if (!estado || estado.esperandoAMPM) return;

  const texto = ctx.message.text.trim();
  const regex12h = /^([1-9]|1[0-2])(:([0-5]\d))?$/;

  if (!regex12h.test(texto)) {
    return ctx.reply('⚠️ Formato inválido. Escribe un número del 1 al 12, opcionalmente con minutos (Ejemplo: `11` o `11:30`).', { parse_mode: 'Markdown' });
  }

  estado.horaParcial = texto;
  estado.esperandoAMPM = true;

  ctx.reply(
    `⏰ Has escrito: **${texto}**.\n\nAhora selecciona si es **AM** o **PM** usando los botones de abajo: 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌅 AM', 'ampm_AM'), Markup.button.callback('🌙 PM', 'ampm_PM')],
        [Markup.button.callback('⬅️ Cancelar / Volver', 'menu_horarios')]
      ])
    }
  );
});

// Procesar selección de AM o PM mediante botones
bot.action(/^ampm_(AM|PM)$/, (ctx) => {
  const ampm = ctx.match[1];
  const userId = ctx.from.id;
  const estado = usuariosEsperandoInput[userId];

  if (!estado || !estado.horaParcial) {
    return ctx.editMessageText('⚠️ La sesión expiró o hubo un error. Usa /configurar nuevamente.');
  }

  const hora24 = convertirA24h(estado.horaParcial, ampm);

  if (estado.tipo === 'cierre') {
    config.horaCierre = hora24;
  } else {
    config.horaApertura = hora24;
  }

  guardarConfig();
  programarTareas();
  delete usuariosEsperandoInput[userId];

  ctx.editMessageText(
    `✅ **¡Horario actualizado con éxito!** 🎉\n\n🌙 Nuevo Cierre: \`${config.horaCierre}\`\n☀️ Nueva Apertura: \`${config.horaApertura}\`\n\n¡Listo! Puedes usar /configurar cuando quieras cambiar algo más.`,
    { parse_mode: 'Markdown' }
  );
});

// Volver al Menú Principal
bot.action('volver_menu', (ctx) => {
  delete usuariosEsperandoInput[ctx.from.id];
  ctx.editMessageText(
    '⚙️ **Panel Principal de Configuración**\n\n¿Qué te gustaría ajustar hoy?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Personalizar Horarios (12h)', 'menu_horarios')]
      ])
    }
  );
});

// Guardar zona horaria seleccionada
bot.action(/^tz_(.+)$/, (ctx) => {
  const selectedTz = ctx.match[1];
  config.timezone = selectedTz;
  guardarConfig();
  programarTareas();

  ctx.editMessageText(
    `✅ **¡Zona horaria actualizada con éxito!** 🌍\n\nNueva zona: \`${selectedTz}\`\n\nPuedes volver al menú principal escribiendo /configurar`,
    { parse_mode: 'Markdown' }
  );
});

// Comando de estado
bot.command('estado', (ctx) => {
  ctx.reply(
    `📊 **Estado Actual del Bot de Horarios**\n\n🌍 Zona: \`${config.timezone}\`\n🌙 Cierre (Modo Noche): \`${config.horaCierre}\`\n☀️ Apertura: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.launch().then(() => {
  console.log("Bot moderno iniciado correctamente...");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
