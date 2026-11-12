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
  horaCierre: '23:00', // 11:00 PM por defecto
  horaApertura: '07:00' // 7:00 AM por defecto
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

// Servidor web para Koyeb (mantiene el bot activo)
const port = process.env.PORT || 8000;
http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot de horarios activo');
}).listen(port, () => {
  console.log(`Servidor web escuchando en puerto ${port}`);
});

// Funciones para abrir y cerrar el grupo con mensajes dinámicos
async function cerrarGrupo() {
  try {
    await bot.telegram.setChatPermissions(chatId, {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    });
    
    // Mensaje personalizado solicitando el horario configurado
    const mensaje = `🌙 **MODO NOCHE ACTIVADO**\n\n🛑 **A PARTIR DE AHORA, NO SE PUEDEN MANDAR MENSAJES NI FOTOS EN EL GRUPO HASTA LAS ${config.horaApertura} HS.**`;
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
    
    const mensaje = `☀️ **¡BUENOS DÍAS!**\n\n🔓 El grupo se ha abierto nuevamente. ¡Ya pueden enviar mensajes y fotos!`;
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

// ---------------------------------------------------------
// COMANDOS E INTERACCIÓN
// ---------------------------------------------------------

bot.command('configurar', (ctx) => {
  ctx.reply(
    '⚙️ **Panel de Configuración**\nSelecciona una opción para ajustar:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Cambiar Horarios (Cierre/Apertura)', 'menu_horarios')]
      ])
    }
  );
});

// Menú de Zonas Horarias
bot.action('menu_paises', (ctx) => {
  ctx.editMessageText(
    '🌍 Selecciona tu país:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🇲🇽 México', 'pais_mexico')],
        [Markup.button.callback('🇦🇷 Argentina', 'pais_argentina')],
        [Markup.button.callback('🇪🇸 España', 'pais_espana')],
        [Markup.button.callback('🇨🇴 Colombia', 'pais_colombia')],
        [Markup.button.callback('⬅️ Volver', 'volver_menu')]
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

// Menú para cambiar horarios predeterminados
bot.action('menu_horarios', (ctx) => {
  ctx.editMessageText(
    `🕒 **Configuración de Horarios Actuales**\n\nCierre (Modo Noche): \`${config.horaCierre}\`\nApertura (Mañana): \`${config.horaApertura}\`\n\n¿Qué horario deseas establecer?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌙 Cerrar a las 23:00 (11 PM)', 'set_cierre_23')],
        [Markup.button.callback('🌙 Cerrar a las 22:00 (10 PM)', 'set_cierre_22')],
        [Markup.button.callback('☀️ Abrir a las 07:00 AM', 'set_apertura_07')],
        [Markup.button.callback('☀️ Abrir a las 08:00 AM', 'set_apertura_08')],
        [Markup.button.callback('⬅️ Volver', 'volver_menu')]
      ])
    }
  );
});

// Acciones para guardar horas de cierre
bot.action('set_cierre_23', (ctx) => {
  config.horaCierre = '23:00';
  guardarConfig();
  programarTareas();
  ctx.editMessageText(`✅ Hora de cierre actualizada a las **23:00 (11 PM)** correctamente.`, { parse_mode: 'Markdown' });
});

bot.action('set_cierre_22', (ctx) => {
  config.horaCierre = '22:00';
  guardarConfig();
  programarTareas();
  ctx.editMessageText(`✅ Hora de cierre actualizada a las **22:00 (10 PM)** correctamente.`, { parse_mode: 'Markdown' });
});

// Acciones para guardar horas de apertura
bot.action('set_apertura_07', (ctx) => {
  config.horaApertura = '07:00';
  guardarConfig();
  programarTareas();
  ctx.editMessageText(`✅ Hora de apertura actualizada a las **07:00 AM** correctamente.`, { parse_mode: 'Markdown' });
});

bot.action('set_apertura_08', (ctx) => {
  config.horaApertura = '08:00';
  guardarConfig();
  programarTareas();
  ctx.editMessageText(`✅ Hora de apertura actualizada a las **08:00 AM** correctamente.`, { parse_mode: 'Markdown' });
});

bot.action('volver_menu', (ctx) => {
  ctx.editMessageText(
    '⚙️ **Panel de Configuración**\nSelecciona una opción para ajustar:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Cambiar Horarios (Cierre/Apertura)', 'menu_horarios')]
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
    `✅ **¡Zona horaria actualizada con éxito!**\n\n🌍 Nueva zona: \`${selectedTz}\``,
    { parse_mode: 'Markdown' }
  );
});

// Comando de estado
bot.command('estado', (ctx) => {
  ctx.reply(
    `📊 **Estado del Bot de Horarios**\n\n🌍 Zona: \`${config.timezone}\`\n🌙 Cierre (Modo Noche): \`${config.horaCierre}\`\n☀️ Apertura: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.launch().then(() => {
  console.log("Bot iniciado correctamente...");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
