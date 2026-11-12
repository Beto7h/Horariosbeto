const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN;
const chatId = process.env.CHAT_ID;
const ownerId = process.env.OWNER_ID ? parseInt(process.env.OWNER_ID) : null;

if (!token || !chatId) {
  console.error("Faltan las variables BOT_TOKEN o CHAT_ID");
  process.exit(1);
}

const bot = new Telegraf(token, {
  handlerTimeout: 90000
});

const CONFIG_FILE = path.join(__dirname, 'config.json');

let config = {
  timezone: 'America/Mexico_City',
  horaCierre: '23:00', 
  horaApertura: '07:00' 
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const data = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(data);
  } catch (e) {
    console.error("Error al leer config.json:", e);
  }
}

function guardarConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// Variable para almacenar el ID del último mensaje de aviso nocturno y poder borrarlo luego
let ultimoMensajeCierreId = null;

const usuariosEsperandoInput = {};

// Servidor web ligero para Koyeb
const port = process.env.PORT || 8000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
});

server.listen(port, () => {
  console.log(`Servidor web ligero escuchando en puerto ${port}`);
});

function obtenerNombreZona(tz) {
  if (tz.includes('Mexico_City')) return 'Zona México (Centro)';
  if (tz.includes('Tijuana')) return 'Zona México (Noroeste / Tijuana)';
  if (tz.includes('Cancun')) return 'Zona México (Sureste / Cancún)';
  if (tz.includes('Buenos_Aires')) return 'Zona Argentina (Buenos Aires)';
  if (tz.includes('Madrid')) return 'Zona España (Madrid / Málaga)';
  if (tz.includes('Canary')) return 'Zona España (Islas Canarias)';
  if (tz.includes('Bogota')) return 'Zona Colombia (Bogotá)';
  return `Zona (${tz})`;
}

async function cerrarGrupo() {
  try {
    const chatInfo = await bot.telegram.getChat(chatId);
    if (chatInfo.permissions && chatInfo.permissions.can_send_messages) {
      await bot.telegram.setChatPermissions(chatId, {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_polls: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false
      });
    }
    
    const zonaTexto = obtenerNombreZona(config.timezone);
    // Título en negrita tal como lo pediste
    const mensaje = `🌙 **AVISO OFICIAL: INICIO DE MODO NOCTURNO** 🌖\n\nA partir de este momento, entramos en modo descanso. El grupo se abrirá de nuevo en un horario de las **${config.horaApertura} hrs**, ${zonaTexto}.`;
    
    const sentMsg = await bot.telegram.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
    // Guardamos el ID del mensaje nocturno para borrarlo por la mañana
    ultimoMensajeCierreId = sentMsg.message_id;
  } catch (error) {
    console.error("Error al ejecutar el cierre del grupo:", error);
  }
}

async function abrirGrupo() {
  try {
    const chatInfo = await bot.telegram.getChat(chatId);
    if (chatInfo.permissions && !chatInfo.permissions.can_send_messages) {
      await bot.telegram.setChatPermissions(chatId, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      });
    }

    // Autoeliminar el aviso de modo nocturno anterior si existe
    if (ultimoMensajeCierreId) {
      try {
        await bot.telegram.deleteMessage(chatId, ultimoMensajeCierreId);
        console.log("Mensaje de modo nocturno anterior eliminado con éxito.");
      } catch (err) {
        console.error("No se pudo eliminar el mensaje anterior (quizás ya fue borrado):", err);
      }
      ultimoMensajeCierreId = null; // Reiniciar variable
    }

    const zonaTexto = obtenerNombreZona(config.timezone);
    // Título de apertura en negrita
    const mensaje = `☀️ **AVISO OFICIAL: FIN DE MODO NOCTURNO** 🌅\n\nEl período de descanso ha concluido. El grupo se encuentra abierto nuevamente (${zonaTexto}). ¡Ya pueden enviar mensajes y fotos!`;
    
    await bot.telegram.sendMessage(chatId, mensaje, { parse_mode: 'Markdown' });
  } catch (error) {
    console.error("Error al ejecutar la apertura del grupo:", error);
  }
}

let tareaCierre = null;
let tareaApertura = null;

function programarTareas() {
  if (tareaCierre) tareaCierre.stop();
  if (tareaApertura) tareaApertura.stop();

  const [horaC, minC] = config.horaCierre.split(':');
  const [horaA, minA] = config.horaApertura.split(':');

  tareaCierre = cron.schedule(`${minC} ${horaC} * * *`, () => cerrarGrupo(), { timezone: config.timezone });
  tareaApertura = cron.schedule(`${minA} ${horaA} * * *`, () => abrirGrupo(), { timezone: config.timezone });
}

programarTareas();

function convertirA24h(hora12, ampm) {
  let [h, m] = hora12.split(':');
  let horaNum = parseInt(h);
  let minStr = m || '00';
  
  if (ampm === 'PM' && horaNum < 12) horaNum += 12;
  if (ampm === 'AM' && horaNum === 12) horaNum = 0;
  
  return `${horaNum.toString().padStart(2, '0')}:${minStr}`;
}

// ---------------------------------------------------------
// RESTRICCIÓN DE PROPIETARIO Y COMANDOS
// ---------------------------------------------------------

// Middleware para verificar si el usuario es el dueño autorizado
function verificarOwner(ctx, next) {
  // Si se configuró un OWNER_ID y el usuario no coincide, rechazar
  if (ownerId && ctx.from.id !== ownerId) {
    return ctx.reply('⛔ Lo siento, no tienes permisos autorizados para configurar este bot.');
  }
  return next();
}

bot.command('configurar', verificarOwner, async (ctx) => {
  delete usuariosEsperandoInput[ctx.from.id];
  await ctx.reply(
    '⚙️ **Panel Principal de Configuración**\n\n¿Qué parámetro desea ajustar?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Personalizar Horarios (12h)', 'menu_horarios')]
      ])
    }
  );
});

bot.action('menu_paises', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  await ctx.editMessageText(
    '🌍 **Seleccione su país:**',
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

bot.action('pais_mexico', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  await ctx.editMessageText('🇲🇽 **México** - Seleccione su región:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Centro / CDMX', 'tz_America/Mexico_City')],
      [Markup.button.callback('Tijuana', 'tz_America/Tijuana')],
      [Markup.button.callback('Cancún', 'tz_America/Cancun')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('pais_argentina', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  await ctx.editMessageText('🇦🇷 **Argentina**:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Buenos Aires', 'tz_America/Argentina/Buenos_Aires')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('pais_espana', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  await ctx.editMessageText('🇪🇸 **España**:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Madrid / Málaga', 'tz_Europe/Madrid')],
      [Markup.button.callback('Islas Canarias', 'tz_Atlantic/Canary')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('pais_colombia', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  await ctx.editMessageText('🇨🇴 **Colombia**:', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Bogotá', 'tz_America/Bogota')],
      [Markup.button.callback('⬅️ Volver', 'menu_paises')]
    ])
  });
});

bot.action('menu_horarios', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  delete usuariosEsperandoInput[ctx.from.id];
  await ctx.editMessageText(
    `🕒 **Configuración de Horarios**\n\n🌙 Cierre actual: \`${config.horaCierre}\`\n☀️ Apertura actual: \`${config.horaApertura}\`\n\n¿Qué horario desea modificar?`,
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

bot.action('pedir_cierre', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  usuariosEsperandoInput[ctx.from.id] = { tipo: 'cierre', esperandoAMPM: false };
  await ctx.editMessageText(
    '🌙 **Modo Cierre (Modo Noche)**\n\nEscriba la hora numérica del 1 al 12 (puede incluir minutos como `11` o `11:30`).\n\n*(Escriba el número directamente en el chat)*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Volver', 'menu_horarios')]
      ])
    }
  );
});

bot.action('pedir_apertura', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  usuariosEsperandoInput[ctx.from.id] = { tipo: 'apertura', esperandoAMPM: false };
  await ctx.editMessageText(
    '☀️ **Modo Apertura (Mañana)**\n\nEscriba la hora numérica del 1 al 12 (puede incluir minutos como `7` o `7:30`).\n\n*(Escribe el número directamente en el chat)*',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Volver', 'menu_horarios')]
      ])
    }
  );
});

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const estado = usuariosEsperandoInput[userId];

  if (!estado || estado.esperandoAMPM) return;

  const texto = ctx.message.text.trim();
  const regex12h = /^([1-9]|1[0-2])(:([0-5]\d))?$/;

  if (!regex12h.test(texto)) {
    return ctx.reply('⚠️ Formato inválido. Escriba un número del 1 al 12, opcionalmente con minutos (Ejemplo: `11` o `11:30`).', { parse_mode: 'Markdown' });
  }

  estado.horaParcial = texto;
  estado.esperandoAMPM = true;

  await ctx.reply(
    `⏰ Ha ingresado: **${texto}**.\n\nAhora seleccione si corresponde a **AM** o **PM** mediante los siguientes botones: 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌅 AM', 'ampm_AM'), Markup.button.callback('🌙 PM', 'ampm_PM')],
        [Markup.button.callback('⬅️ Cancelar / Volver', 'menu_horarios')]
      ])
    }
  );
});

bot.action(/^ampm_(AM|PM)$/, async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  const ampm = ctx.match[1];
  const userId = ctx.from.id;
  const estado = usuariosEsperandoInput[userId];

  if (!estado || !estado.horaParcial) {
    return ctx.editMessageText('⚠️ La sesión ha expirado. Utilice /configurar nuevamente.');
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

  await ctx.editMessageText(
    `✅ **¡Horario actualizado correctamente!**\n\n🌙 Nuevo Cierre: \`${config.horaCierre}\`\n☀️ Nueva Apertura: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.action('volver_menu', async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  delete usuariosEsperandoInput[ctx.from.id];
  await ctx.editMessageText(
    '⚙️ **Panel Principal de Configuración**\n\n¿Qué parámetro desea ajustar?',
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🌍 Cambiar Zona Horaria', 'menu_paises')],
        [Markup.button.callback('🕒 Personalizar Horarios (12h)', 'menu_horarios')]
      ])
    }
  );
});

bot.action(/^tz_(.+)$/, async (ctx) => {
  if (ownerId && ctx.from.id !== ownerId) return ctx.answerCbQuery('⛔ No autorizado.');
  const selectedTz = ctx.match[1];
  config.timezone = selectedTz;
  guardarConfig();
  programarTareas();

  await ctx.editMessageText(
    `✅ **¡Zona horaria actualizada con éxito!**\n\nNueva zona: \`${selectedTz}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.command('estado', verificarOwner, async (ctx) => {
  await ctx.reply(
    `📊 **Estado Actual del Bot de Horarios**\n\n🌍 Zona horaria: \`${config.timezone}\`\n🌙 Cierre (Modo Noche): \`${config.horaCierre}\`\n☀️ Apertura: \`${config.horaApertura}\``,
    { parse_mode: 'Markdown' }
  );
});

bot.launch().then(() => {
  console.log("Bot avanzado con control de owner y autoeliminación iniciado.");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
