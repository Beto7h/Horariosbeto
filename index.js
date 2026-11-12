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

// Objeto para registrar qué usuario está escribiendo una hora personalizada
const usuariosEsperandoInput = {};

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
// MENÚS Y COMANDOS
// ---------------------------------------------------------

bot.command('configurar', (ctx) => {
  // Limpiar estados previos si existían
  delete usuariosEsperandoInput[ctx.from.id];
  
  ctx.reply(
    '⚙️ **Panel Principal de Configuración**\nSelecciona una opción:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Cambiar Horarios (Personalizar)', 'menu_horarios')]
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

// Menú de Horarios Personalizados
bot.action('menu_horarios', (ctx) => {
  delete usuariosEsperandoInput[ctx.from.id];
  ctx.editMessageText(
    `🕒 **Configuración de Horarios**\n\n🌙 Hora de Cierre actual: \`${config.horaCierre}\`\n☀️ Hora de Apertura actual: \`${config.horaApertura}\`\n\n¿Qué hora deseas modificar?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌙 Escribir nueva Hora de Cierre', 'pedir_cierre')],
        [Markup.button.callback('☀️ Escribir nueva Hora de Apertura', 'pedir_apertura')],
        [Markup.button.callback('⬅️ Volver al Menú Principal', 'volver_menu')]
      ])
    }
  );
});

// Solicitar hora de cierre por texto
bot.action('pedir_cierre', (ctx) => {
  usuariosEsperandoInput[ctx.from.id] = 'cierre';
  ctx.editMessageText(
    '🌙 **Modo Cierre Personalizado**\n\nPor favor, escribe la nueva hora de cierre en formato de 24 horas (`HH:MM`).\n*Ejemplo:* `23:30` o `22:00`\n\n*(Escribe el texto directamente en el chat)*',
    { parse_mode: 'Markdown' }
  );
});

// Solicitar hora de apertura por texto
bot.action('pedir_apertura', (ctx) => {
  usuariosEsperandoInput[ctx.from.id] = 'apertura';
  ctx.editMessageText(
    '☀️ **Modo Apertura Personalizado**\n\nPor favor, escribe la nueva hora de apertura en formato de 24 horas (`HH:MM`).\n*Ejemplo:* `07:00` o `06:30`\n\n*(Escribe el texto directamente en el chat)*',
    { parse_mode: 'Markdown' }
  );
});

// Capturar texto enviado por el usuario cuando está configurando una hora
bot.on('text', (ctx) => {
  const userId = ctx.from.id;
  const estado = usuariosEsperandoInput[userId];

  if (!estado) return; // Si no está configurando nada, ignorar

  const texto = ctx.message.text.trim();
  // Validar formato HH:MM (ej. 23:00, 07:30)
  const regexHora = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!regexHora.test(texto)) {
    return ctx.reply('⚠️ Formato incorrecto. Por favor escríbelo en formato de 24 horas como `HH:MM` (Ejemplo: `23:00`).', { parse_mode: 'Markdown' });
  }

  if (estado === 'cierre') {
    config.horaCierre = texto;
    guardarConfig();
    programarTareas();
    delete usuariosEsperandoInput[userId];
    ctx.reply(`✅ **¡Hora de cierre actualizada con éxito!**\n\n🌙 Nuevo cierre: \`${config.horaCierre}\`\n\nUsa /configurar si deseas cambiar algo más.`, { parse_mode: 'Markdown' });
  } else if (estado === 'apertura') {
    config.horaApertura = texto;
    guardarConfig();
    programarTareas();
    delete usuariosEsperandoInput[userId];
    ctx.reply(`✅ **¡Hora de apertura actualizada con éxito!**\n\n☀️ Nueva apertura: \`${config.horaApertura}\`\n\nUsa /configurar si deseas cambiar algo más.`, { parse_mode: 'Markdown' });
  }
});

// Botón de Volver al Menú Principal
bot.action('volver_menu', (ctx) => {
  delete usuariosEsperandoInput[ctx.from.id];
  ctx.editMessageText(
    '⚙️ **Panel Principal de Configuración**\nSelecciona una opción:',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Cambiar Horarios (Personalizar)', 'menu_horarios')]
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
    `✅ **¡Zona horaria actualizada con éxito!**\n\n🌍 Nueva zona: \`${selectedTz}\`\n\nPuedes volver al menú escribiendo /configurar`,
    { parse_mode: 'Markdown' }
  );
});

// Comando de estado
bot.command('estado', (ctx) => {
  ctx.reply(
    `📊 **Estado del Bot de Horarios**\n\n🌍 Zona: \`${config.timezone}\`\n🌙 Cierre: \`${config.horaCierre}\`\n☀️ Apertura: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.launch().then(() => {
  console.log("Bot avanzado iniciado correctamente...");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
