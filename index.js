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

// Archivo para guardar la configuración de zona horaria y horarios de forma persistente local
const CONFIG_FILE = path.join(__dirname, 'config.json');

let config = {
  timezone: process.env.DEFAULT_TIMEZONE || 'America/Mexico_City',
  horaCierre: '22:00', // 10:00 PM por defecto
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

// Funciones para abrir y cerrar el grupo
async function cerrarGrupo() {
  try {
    await bot.telegram.setChatPermissions(chatId, {
      can_send_messages: false,
      can_send_media_messages: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false
    });
    await bot.telegram.sendMessage(chatId, "🔒 El grupo se ha cerrado automáticamente por horario de descanso.");
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
    await bot.telegram.sendMessage(chatId, "🔓 ¡Buenos días! El grupo está abierto nuevamente.");
    console.log("Grupo abierto correctamente.");
  } catch (error) {
    console.error("Error al abrir el grupo:", error);
  }
}

// Variables globales para las tareas de cron (para poder reiniciarlas al cambiar de zona)
let tareaCierre = null;
let tareaApertura = null;

function programarTareas() {
  if (tareaCierre) tareaCierre.stop();
  if (tareaApertura) tareaApertura.stop();

  // Convertir hora 'HH:MM' a formato cron 'minuto hora * * *'
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

  console.log(`Tareas programadas con zona horaria: ${config.timezone}`);
  console.log(`Cierre: ${config.horaCierre} | Apertura: ${config.horaApertura}`);
}

// Iniciar programación inicial
programarTareas();

// ---------------------------------------------------------
// COMANDOS E INTERACCIÓN CON BOTONES (Configuración de Zona Horaria)
// ---------------------------------------------------------

bot.command('configurar', (ctx) => {
  ctx.reply(
    '⚙️ **Panel de Configuración**\nSelecciona tu país para configurar la zona horaria:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🇲🇽 México', 'pais_mexico')],
        [Markup.button.callback('🇦🇷 Argentina', 'pais_argentina')],
        [Markup.button.callback('🇪🇸 España', 'pais_espana')],
        [Markup.button.callback('🇨🇴 Colombia', 'pais_colombia')]
      ])
    }
  );
});

// Paso 2: Mostrar ciudades según el país elegido
bot.action('pais_mexico', (ctx) => {
  ctx.editMessageText(
    '🇲🇽 **México** - Selecciona tu región/ciudad:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Centro / CDMX', 'tz_America/Mexico_City')],
        [Markup.button.callback('Tijuana / Noroeste', 'tz_America/Tijuana')],
        [Markup.button.callback('Cancún / Sureste', 'tz_America/Cancun')],
        [Markup.button.callback('⬅️ Volver', 'volver_paises')]
      ])
    }
  );
});

bot.action('pais_argentina', (ctx) => {
  ctx.editMessageText(
    '🇦🇷 **Argentina** - Selecciona tu región:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Buenos Aires', 'tz_America/Argentina/Buenos_Aires')],
        [Markup.button.callback('⬅️ Volver', 'volver_paises')]
      ])
    }
  );
});

bot.action('pais_espana', (ctx) => {
  ctx.editMessageText(
    '🇪🇸 **España** - Selecciona tu región:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Madrid / Málaga (Península)', 'tz_Europe/Madrid')],
        [Markup.button.callback('Islas Canarias', 'tz_Atlantic/Canary')],
        [Markup.button.callback('⬅️ Volver', 'volver_paises')]
      ])
    }
  );
});

bot.action('pais_colombia', (ctx) => {
  ctx.editMessageText(
    '🇨🇴 **Colombia** - Selecciona tu región:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('Bogotá / General', 'tz_America/Bogota')],
        [Markup.button.callback('⬅️ Volver', 'volver_paises')]
      ])
    }
  );
});

bot.action('volver_paises', (ctx) => {
  ctx.editMessageText(
    '⚙️ **Panel de Configuración**\nSelecciona tu país para configurar la zona horaria:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🇲🇽 México', 'pais_mexico')],
        [Markup.button.callback('🇦🇷 Argentina', 'pais_argentina')],
        [Markup.button.callback('🇪🇸 España', 'pais_espana')],
        [Markup.button.callback('🇨🇴 Colombia', 'pais_colombia')]
      ])
    }
  );
});

// Paso 3: Guardar la zona horaria seleccionada
bot.action(/^tz_(.+)$/, (ctx) => {
  const selectedTz = ctx.match[1];
  config.timezone = selectedTz;
  guardarConfig();
  programarTareas();

  ctx.editMessageText(
    `✅ **¡Zona horaria actualizada con éxito!**\n\n🌍 Nueva zona: \`${selectedTz}\`\n🕒 Cierre programado: \`${config.horaCierre}\`\n🔓 Apertura programada: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

// Comando de ayuda para ver el estado actual
bot.command('estado', (ctx) => {
  ctx.reply(
    `📊 **Estado Actual del Bot**\n\n🌍 Zona horaria: \`${config.timezone}\`\n🔒 Hora de cierre: \`${config.horaCierre}\`\n🔓 Hora de apertura: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.launch().then(() => {
  console.log("Bot iniciado y escuchando comandos...");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
