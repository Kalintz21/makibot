/*
=========================================================
       POLACO GUARDIAN - ENHANCED FINAL + DEBUG
=========================================================

Comandos:
  /guardian
  /guardianstatus
  /leave
  /polaco
  /ping
  /status
  /help
  /dk
  /avatar
  /userinfo
  /falar
  /say
  /cleanmakki
  /cleanmakkistatus

CleanMakki DEBUG:
  - Mostra ID do autor
  - ID do canal
  - Webhook ID
  - Conteúdo recebido
  - Embeds
  - Texto normalizado
  - Resultado de cada padrão
  - Motivo exato de uma mensagem ser ignorada

=========================================================
*/

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const {
  Client,
  Events,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  version: discordJsVersion
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');

const sodium = require('libsodium-wrappers');

// ======================================================
// CONFIG
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = process.env.PORT || 10000;

const DEV_USER_ID = '711382505558638612';

const MAKKI_ID = '563434444321587202';
const MAKKI_CHANNEL = '1300277158165614699';

const DELETE_DELAY = 2 * 60 * 60 * 1000;
const DEV_MENTION_DELETE_DELAY = 5 * 60 * 1000;
const MAX_VOICE_REJOIN_ATTEMPTS = 5;

// ======================================================
// LOGGER
// ======================================================

function timestamp() {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
}

function log(tag, message, ...extra) {
  console.log(`[${timestamp()}] [${tag}] ${message}`, ...extra);
}

function warn(tag, message, ...extra) {
  console.warn(`[${timestamp()}] [${tag}] ${message}`, ...extra);
}

function errorLog(tag, message, ...extra) {
  console.error(`[${timestamp()}] [${tag}] ${message}`, ...extra);
}

// ======================================================
// CLIENT
// ======================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ======================================================
// EXPRESS / RENDER
// ======================================================

const app = express();

app.get('/', (req, res) => {
  res.status(200).send('Polaco Guardian is alive ✅');
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    discordReady: client.isReady(),
    bot: client.user?.tag || null,
    gatewayPing: client.ws.ping,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  log('SERVER', `Listening on port ${PORT} ✅`);
});

// ======================================================
// PERMISSIONS
// ======================================================

function hasAdminPermission(interaction) {
  const member = interaction.member;

  if (!member?.permissions) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  );
}

async function requireAdmin(interaction) {
  if (hasAdminPermission(interaction)) return true;

  const message =
    '❌ Você precisa da permissão **Gerenciar Mensagens** ou **Administrador** para usar este comando.';

  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(message).catch(() => {});
  } else {
    await interaction.reply({
      content: message,
      flags: MessageFlags.Ephemeral
    }).catch(() => {});
  }

  return false;
}

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName('guardian')
    .setDescription('Conecta o Polaco Guardian ao seu canal de voz'),

  new SlashCommandBuilder()
    .setName('guardianstatus')
    .setDescription('Mostra o estado da conexão de voz'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Desconecta o Polaco Guardian da call'),

  new SlashCommandBuilder()
    .setName('polaco')
    .setDescription('Verifica se o Polaco Guardian está ativo'),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Mostra a latência do bot'),

  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Mostra o status técnico do Polaco Guardian'),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Mostra os comandos disponíveis'),

  new SlashCommandBuilder()
    .setName('dk')
    .setDescription('Mostra informações do servidor'),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Mostra o avatar de um usuário')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuário que deseja consultar')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Mostra informações de um usuário')
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription('Usuário que deseja consultar')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('falar')
    .setDescription('Faz o Guardian enviar uma mensagem')
    .addStringOption(option =>
      option
        .setName('texto')
        .setDescription('Texto que será enviado')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('say')
    .setDescription('Faz o Guardian enviar uma mensagem')
    .addStringOption(option =>
      option
        .setName('texto')
        .setDescription('Texto que será enviado')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('cleanmakki')
    .setDescription('Remove manualmente a mensagem automática do Makki'),

  new SlashCommandBuilder()
    .setName('cleanmakkistatus')
    .setDescription('Mostra o status do CleanMakki')
].map(command => command.toJSON());

// ======================================================
// REGISTER COMMANDS
// ======================================================

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    log('SLASH', `Registering ${commands.length} commands...`);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    log('SLASH', `${commands.length} commands registered ✅`);
  } catch (err) {
    errorLog('SLASH', 'Command registration failed', err);
  }
}

// ======================================================
// SILENT AUDIO
// ======================================================

function getSilentAudioPath() {
  const mp3 = path.join(__dirname, 'silence.mp3');
  const wav = path.join(__dirname, 'silence.wav');

  if (fs.existsSync(mp3)) return mp3;
  if (fs.existsSync(wav)) return wav;

  throw new Error('silence.mp3 ou silence.wav não encontrado.');
}

// ======================================================
// VOICE
// ======================================================

const voicePlayers = new Map();
const voiceChannels = new Map();

function createVoicePlayer(guildId) {
  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  player.on('error', err => {
    errorLog('VOICE', `Audio player error | Guild ${guildId}`, err);
  });

  function playSilence() {
    try {
      const resource = createAudioResource(getSilentAudioPath());
      player.play(resource);
    } catch (err) {
      errorLog('VOICE', 'Could not start silence', err);
    }
  }

  player.on(AudioPlayerStatus.Idle, () => {
    setTimeout(playSilence, 500);
  });

  player.on(AudioPlayerStatus.Playing, () => {
    log('VOICE', `Silent audio playing | Guild ${guildId} ✅`);
  });

  playSilence();

  return player;
}

function configureVoiceReconnect(connection, guildId) {
  let reconnecting = false;

  connection.on('stateChange', async (oldState, newState) => {
    log(
      'VOICE',
      `${guildId}: ${oldState.status} -> ${newState.status}`
    );

    if (newState.status === VoiceConnectionStatus.Ready) {
      reconnecting = false;
      log('VOICE', `Connection ready | Guild ${guildId} ✅`);
      return;
    }

    if (newState.status !== VoiceConnectionStatus.Disconnected) return;
    if (reconnecting) return;

    reconnecting = true;

    warn('VOICE', `Connection disconnected | Guild ${guildId}`);

    try {
      await Promise.race([
        entersState(
          connection,
          VoiceConnectionStatus.Signalling,
          5000
        ),
        entersState(
          connection,
          VoiceConnectionStatus.Connecting,
          5000
        )
      ]);

      log('VOICE', `Automatic recovery started | Guild ${guildId}`);
      reconnecting = false;
      return;
    } catch {}

    if (
      connection.rejoinAttempts >=
      MAX_VOICE_REJOIN_ATTEMPTS
    ) {
      errorLog(
        'VOICE',
        `Maximum rejoin attempts reached | Guild ${guildId}`
      );

      reconnecting = false;
      return;
    }

    const attempt = connection.rejoinAttempts + 1;
    const delay = Math.min(5000 * attempt, 30000);

    warn(
      'VOICE',
      `Rejoin attempt ${attempt}/${MAX_VOICE_REJOIN_ATTEMPTS} in ${delay / 1000}s`
    );

    setTimeout(() => {
      try {
        connection.rejoin();

        log(
          'VOICE',
          `Rejoin requested | Guild ${guildId}`
        );
      } catch (err) {
        errorLog('VOICE', 'Rejoin failed', err);
      }

      reconnecting = false;
    }, delay);
  });

  connection.on('error', err => {
    errorLog(
      'VOICE',
      `Connection error | Guild ${guildId}`,
      err
    );
  });
}

async function connectVoice(member) {
  const channel = member.voice?.channel;

  if (!channel) {
    throw new Error('Você precisa estar em um canal de voz.');
  }

  const guildId = channel.guild.id;

  const existing = getVoiceConnection(guildId);

  if (existing) {
    log('VOICE', 'Destroying previous connection...');

    try {
      existing.destroy();
    } catch {}

    voicePlayers.delete(guildId);
    voiceChannels.delete(guildId);

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  log(
    'VOICE',
    `Connecting to "${channel.name}" (${channel.id})...`
  );

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  configureVoiceReconnect(connection, guildId);

  log('VOICE', 'Waiting for Ready state...');

  try {
    await entersState(
      connection,
      VoiceConnectionStatus.Ready,
      30000
    );
  } catch {
    try {
      connection.destroy();
    } catch {}

    throw new Error(
      'A conexão de voz não ficou pronta em 30 segundos.'
    );
  }

  const player = createVoicePlayer(guildId);

  connection.subscribe(player);

  voicePlayers.set(guildId, player);

  voiceChannels.set(guildId, {
    id: channel.id,
    name: channel.name,
    connectedAt: Date.now()
  });

  log('VOICE', `Connected to "${channel.name}" ✅`);

  return connection;
}

// ======================================================
// CLEAN MAKKI
// ======================================================

const makkiTimers = new Map();
let lastMakkiMessage = null;

// ======================================================
// NORMALIZAÇÃO DE TEXTO
// ======================================================

function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getMakkiMessageText(message) {
  let text = message.content || '';

  for (const embed of message.embeds || []) {
    text += ` ${embed.title || ''}`;
    text += ` ${embed.description || ''}`;

    for (const field of embed.fields || []) {
      text += ` ${field.name || ''}`;
      text += ` ${field.value || ''}`;
    }

    text += ` ${embed.footer?.text || ''}`;
    text += ` ${embed.author?.name || ''}`;
  }

  return normalizeText(text);
}

// ======================================================
// ANÁLISE DETALHADA DO MAKKI
// ======================================================

function analyzeMakkiMessage(message) {
  const text = getMakkiMessageText(message);

  const authorMatch =
    message.author?.id === MAKKI_ID;

  const channelMatch =
    message.channel?.id === MAKKI_CHANNEL;

  const patterns = {
    comunidade:
      text.includes('voces gostam da nossa comunidade'),

    registro:
      text.includes('registro'),

    tagDK:
      (
        text.includes('tag "dk"') ||
        text.includes("tag 'dk'") ||
        text.includes('tag dk') ||
        (
          text.includes('tag') &&
          text.includes('"dk"')
        )
      ),

    amigos:
      text.includes('convide seus amigos')
  };

  /*
  Como já exigimos:
  - ID exato do Makki
  - canal exato

  Basta UMA característica forte do texto.
  */

  const textMatch =
    patterns.comunidade ||
    patterns.amigos ||
    patterns.tagDK;

  const finalMatch =
    authorMatch &&
    channelMatch &&
    textMatch;

  return {
    text,
    authorMatch,
    channelMatch,
    patterns,
    textMatch,
    finalMatch
  };
}

// ======================================================
// DEBUG CLEAN MAKKI
// ======================================================

function logMakkiDebug(message, source = 'unknown') {
  const analysis =
    analyzeMakkiMessage(message);

  log(
    'CLEANMAKKI DEBUG',
    '================================================'
  );

  log(
    'CLEANMAKKI DEBUG',
    `Source: ${source}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Message ID: ${message.id}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Created: ${new Date(
      message.createdTimestamp
    ).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo'
    })}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Author username: ${
      message.author?.username || 'unknown'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Author tag: ${
      message.author?.tag || 'unknown'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Author ID: ${
      message.author?.id || 'unknown'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Expected Author ID: ${MAKKI_ID}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Author match: ${analysis.authorMatch}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Bot: ${message.author?.bot}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Webhook ID: ${
      message.webhookId || 'nenhum'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Channel ID: ${
      message.channel?.id || 'unknown'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Expected Channel ID: ${MAKKI_CHANNEL}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Channel match: ${analysis.channelMatch}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Raw content length: ${
      message.content?.length || 0
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Raw content: ${
      message.content || '[EMPTY]'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Embeds: ${
      message.embeds?.length || 0
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Attachments: ${
      message.attachments?.size || 0
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Normalized text: ${
      analysis.text || '[EMPTY]'
    }`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Pattern comunidade: ${analysis.patterns.comunidade}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Pattern registro: ${analysis.patterns.registro}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Pattern TAG DK: ${analysis.patterns.tagDK}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Pattern amigos: ${analysis.patterns.amigos}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `Text match: ${analysis.textMatch}`
  );

  log(
    'CLEANMAKKI DEBUG',
    `FINAL MATCH: ${analysis.finalMatch}`
  );

  log(
    'CLEANMAKKI DEBUG',
    '================================================'
  );

  return analysis;
}

// ======================================================
// IDENTIFICAR MENSAGEM DO MAKKI
// ======================================================

function isMakkiMessage(message) {
  return analyzeMakkiMessage(
    message
  ).finalMatch;
}

// ======================================================
// DELETE MAKKI
// ======================================================

async function deleteMakkiMessage(
  message,
  reason
) {
  if (!message) return false;

  if (
    message.author?.id !==
    MAKKI_ID
  ) {
    warn(
      'CLEANMAKKI',
      `Deletion cancelled for ${message.id}: author is not Makki`
    );

    return false;
  }

  try {
    log(
      'CLEANMAKKI',
      `Attempting to delete ${message.id} | Reason: ${reason}`
    );

    await message.delete();

    const timerData =
      makkiTimers.get(message.id);

    if (timerData?.timer) {
      clearTimeout(
        timerData.timer
      );
    }

    makkiTimers.delete(
      message.id
    );

    if (
      lastMakkiMessage?.id ===
      message.id
    ) {
      lastMakkiMessage =
        null;
    }

    log(
      'CLEANMAKKI',
      `Deleted ${message.id} | Reason: ${reason} ✅`
    );

    return true;

  } catch (err) {
    if (
      err?.code === 10008
    ) {
      makkiTimers.delete(
        message.id
      );

      log(
        'CLEANMAKKI',
        `Message ${message.id} was already deleted`
      );

      return true;
    }

    errorLog(
      'CLEANMAKKI',
      `DELETE FAILED | Message ${message.id}`
    );

    errorLog(
      'CLEANMAKKI',
      `Error name: ${err?.name || 'unknown'}`
    );

    errorLog(
      'CLEANMAKKI',
      `Error message: ${err?.message || err}`
    );

    errorLog(
      'CLEANMAKKI',
      `Discord code: ${err?.code ?? 'N/A'}`
    );

    errorLog(
      'CLEANMAKKI',
      `HTTP status: ${err?.status ?? 'N/A'}`
    );

    return false;
  }
}

// ======================================================
// SCHEDULE
// ======================================================

function scheduleMakkiDeletion(
  message,
  delay
) {
  if (
    makkiTimers.has(
      message.id
    )
  ) {
    log(
      'CLEANMAKKI',
      `Message ${message.id} already has a timer`
    );

    return;
  }

  const deleteAt =
    Date.now() + delay;

  const timer =
    setTimeout(
      async () => {
        await deleteMakkiMessage(
          message,
          '2 hour timer'
        );
      },
      delay
    );

  makkiTimers.set(
    message.id,
    {
      timer,
      deleteAt,
      message
    }
  );

  log(
    'CLEANMAKKI',
    `Scheduled ${message.id} ✅`
  );

  log(
    'CLEANMAKKI',
    `Delete at: ${new Date(
      deleteAt
    ).toLocaleString(
      'pt-BR',
      {
        timeZone:
          'America/Sao_Paulo'
      }
    )}`
  );
}

// ======================================================
// STARTUP SCAN + DIAGNÓSTICO
// ======================================================

async function cleanMakkiOnStartup(
  channel
) {
  try {
    log(
      'CLEANMAKKI',
      'Startup scan...'
    );

    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    log(
      'CLEANMAKKI',
      `${messages.size} messages fetched from channel`
    );

    let makkiCount = 0;
    let textMatchCount = 0;
    let finalMatchCount = 0;

    /*
    Primeiro fazemos diagnóstico de TODAS as
    mensagens encontradas que pertencem ao Makki.
    */

    for (
      const message
      of messages.values()
    ) {
      if (
        message.author?.id ===
        MAKKI_ID
      ) {
        makkiCount++;

        const analysis =
          logMakkiDebug(
            message,
            'startup-scan'
          );

        if (
          analysis.textMatch
        ) {
          textMatchCount++;
        }

        if (
          analysis.finalMatch
        ) {
          finalMatchCount++;
        }
      }
    }

    log(
      'CLEANMAKKI',
      `Startup diagnostics: ${makkiCount} Makki message(s), ${textMatchCount} text match(es), ${finalMatchCount} final match(es)`
    );

    const matches =
      messages
        .filter(isMakkiMessage)
        .sort(
          (a, b) =>
            b.createdTimestamp -
            a.createdTimestamp
        );

    log(
      'CLEANMAKKI',
      `Found ${matches.size} matching message(s).`
    );

    let newest = null;

    for (
      const message
      of matches.values()
    ) {
      if (!newest) {
        newest =
          message;
      }

      const age =
        Date.now() -
        message.createdTimestamp;

      const remaining =
        DELETE_DELAY -
        age;

      log(
        'CLEANMAKKI',
        `Message ${message.id} | Age: ${Math.floor(
          age / 60000
        )} minute(s)`
      );

      if (
        remaining <= 0
      ) {
        await deleteMakkiMessage(
          message,
          'expired during startup'
        );
      } else {
        scheduleMakkiDeletion(
          message,
          remaining
        );
      }
    }

    lastMakkiMessage =
      newest;

    log(
      'CLEANMAKKI',
      'Startup scan finished ✅'
    );

  } catch (err) {
    errorLog(
      'CLEANMAKKI',
      'Startup scan error',
      err
    );
  }
}

// ======================================================
// MANUAL CLEAN MAKKI + DIAGNÓSTICO
// ======================================================

async function manualCleanMakki() {
  try {
    const channel =
      await client.channels.fetch(
        MAKKI_CHANNEL
      );

    if (
      !channel ||
      !channel.isTextBased()
    ) {
      return {
        success: false,
        message:
          'Canal do Makki não encontrado.'
      };
    }

    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    let makkiCount = 0;
    let textMatchCount = 0;
    let finalMatchCount = 0;

    for (
      const message
      of messages.values()
    ) {
      if (
        message.author?.id ===
        MAKKI_ID
      ) {
        makkiCount++;

        const analysis =
          logMakkiDebug(
            message,
            'manual-clean'
          );

        if (
          analysis.textMatch
        ) {
          textMatchCount++;
        }

        if (
          analysis.finalMatch
        ) {
          finalMatchCount++;
        }
      }
    }

    const latest =
      messages
        .filter(isMakkiMessage)
        .sort(
          (a, b) =>
            b.createdTimestamp -
            a.createdTimestamp
        )
        .first();

    if (!latest) {
      return {
        success: false,

        message:
          `Nenhuma mensagem automática do Makki encontrada.\n\n` +
          `📊 Mensagens analisadas: **${messages.size}**\n` +
          `🤖 Mensagens do Makki: **${makkiCount}**\n` +
          `📝 Compatíveis com o texto: **${textMatchCount}**\n` +
          `✅ Compatíveis com todos os filtros: **${finalMatchCount}**\n\n` +
          `Confira os logs **[CLEANMAKKI DEBUG]** no Render.`
      };
    }

    logMakkiDebug(
      latest,
      'manual-delete-target'
    );

    const success =
      await deleteMakkiMessage(
        latest,
        'manual /cleanmakki'
      );

    if (!success) {
      return {
        success: false,
        message:
          `A mensagem foi encontrada, mas o Discord recusou a exclusão.\n` +
          `ID: \`${latest.id}\`\n\n` +
          `Confira **DELETE FAILED** nos logs do Render.`
      };
    }

    return {
      success: true,
      messageId:
        latest.id
    };

  } catch (err) {
    errorLog(
      'CLEANMAKKI',
      'Manual clean failed',
      err
    );

    return {
      success: false,
      message:
        err.message ||
        String(err)
    };
  }
}

// ======================================================
// DEVELOPER MENTION
// ======================================================

async function handleDeveloperMention(
  message
) {
  if (message.author.bot) return;

  if (
    !message.mentions.users.has(
      DEV_USER_ID
    )
  ) {
    return;
  }

  try {
    const reply =
      await message.reply({
        content:
          `Olá ${message.author}, vejo que você mencionou meu desenvolvedor. ` +
          `Se precisar de ajuda, procure o canal de atendimento do servidor.`,

        allowedMentions: {
          repliedUser: false,
          users: [
            message.author.id
          ]
        }
      });

    log(
      'DEVMENTION',
      `Response sent to ${message.author.tag} ✅`
    );

    setTimeout(
      async () => {
        await reply
          .delete()
          .catch(() => {});
      },
      DEV_MENTION_DELETE_DELAY
    );

  } catch (err) {
    errorLog(
      'DEVMENTION',
      'Could not respond',
      err
    );
  }
}

// ======================================================
// READY
// ======================================================

client.once(
  Events.ClientReady,
  async readyClient => {

    console.log('');
    console.log(
      '======================================'
    );

    log(
      'BOT',
      `Logged in as ${readyClient.user.tag} ✅`
    );

    log(
      'BOT',
      `Bot ID: ${readyClient.user.id}`
    );

    log(
      'BOT',
      `Guilds: ${readyClient.guilds.cache.size}`
    );

    console.log(
      '======================================'
    );

    await registerCommands();

    readyClient.user.setPresence({
      activities: [
        {
          name:
            'Battlefield 6 🔥',
          type:
            ActivityType.Playing
        }
      ],
      status: 'dnd'
    });

    log(
      'BOT',
      'Presence configured ✅'
    );

    try {
      const channel =
        await readyClient.channels.fetch(
          MAKKI_CHANNEL
        );

      if (
        channel &&
        channel.isTextBased()
      ) {
        log(
          'CLEANMAKKI',
          `Channel found: ${channel.name} ✅`
        );

        await cleanMakkiOnStartup(
          channel
        );
      }

    } catch (err) {
      errorLog(
        'CLEANMAKKI',
        'Could not fetch Makki channel',
        err
      );
    }

    log(
      'DEVMENTION',
      `Developer mention system active | ID: ${DEV_USER_ID} ✅`
    );
  }
);

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  Events.InteractionCreate,
  async interaction => {

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const command =
      interaction.commandName;

    log(
      'CMD',
      `/${command} by ${interaction.user.tag}`
    );

    try {

      // /guardian
      if (
        command === 'guardian'
      ) {
        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        try {
          await connectVoice(
            interaction.member
          );

          await interaction.editReply(
            '✅ Polaco Guardian conectado à sua call.'
          );

        } catch (err) {
          errorLog(
            'VOICE',
            '/guardian failed',
            err
          );

          await interaction.editReply(
            `❌ Falha ao conectar: \`${err.message || err}\``
          );
        }

        return;
      }

      // /guardianstatus
      if (
        command ===
        'guardianstatus'
      ) {
        const connection =
          getVoiceConnection(
            interaction.guild.id
          );

        if (!connection) {
          await interaction.reply(
            '🔇 O Guardian não está conectado a nenhuma call.'
          );

          return;
        }

        const info =
          voiceChannels.get(
            interaction.guild.id
          );

        const uptime =
          info?.connectedAt
            ? formatDuration(
                Date.now() -
                info.connectedAt
              )
            : 'desconhecido';

        await interaction.reply(
          `🎧 **Guardian Voice Status**\n` +
          `Canal: **${info?.name || 'desconhecido'}**\n` +
          `Estado: **${connection.state.status}**\n` +
          `Conectado há: **${uptime}**\n` +
          `Voice WS: **${connection.ping?.ws ?? 'N/A'}ms**\n` +
          `Voice UDP: **${connection.ping?.udp ?? 'N/A'}ms**\n` +
          `Tentativas de rejoin: **${connection.rejoinAttempts}**`
        );

        return;
      }

      // /leave
      if (
        command === 'leave'
      ) {
        if (
          !(await requireAdmin(
            interaction
          ))
        ) {
          return;
        }

        const connection =
          getVoiceConnection(
            interaction.guild.id
          );

        if (!connection) {
          await interaction.reply({
            content:
              '❌ Não estou conectado à call.',
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        connection.destroy();

        const player =
          voicePlayers.get(
            interaction.guild.id
          );

        if (player) {
          try {
            player.stop(true);
          } catch {}
        }

        voicePlayers.delete(
          interaction.guild.id
        );

        voiceChannels.delete(
          interaction.guild.id
        );

        await interaction.reply({
          content:
            '👋 Desconectado da call.',
          flags:
            MessageFlags.Ephemeral
        });

        return;
      }

      // /polaco
      if (
        command === 'polaco'
      ) {
        await interaction.reply(
          'Polaco Guardian está ativo! ✅'
        );

        return;
      }

      // /ping
      if (
        command === 'ping'
      ) {
        const started =
          Date.now();

        await interaction.reply(
          '🏓 Calculando...'
        );

        const responsePing =
          Date.now() -
          started;

        await interaction.editReply(
          `🏓 **Pong!**\n` +
          `🤖 Bot: **${responsePing}ms**\n` +
          `🌐 Gateway: **${Math.round(client.ws.ping)}ms**`
        );

        return;
      }

      // /status
      if (
        command === 'status'
      ) {
        const memory =
          process.memoryUsage();

        const heapMb =
          (
            memory.heapUsed /
            1024 /
            1024
          ).toFixed(1);

        const rssMb =
          (
            memory.rss /
            1024 /
            1024
          ).toFixed(1);

        const uptime =
          formatDuration(
            process.uptime() *
              1000
          );

        const voice =
          getVoiceConnection(
            interaction.guild.id
          );

        await interaction.reply(
          `🤖 **Polaco Guardian Status**\n\n` +
          `🟢 Discord: **${client.isReady() ? 'Online' : 'Offline'}**\n` +
          `⏱️ Uptime: **${uptime}**\n` +
          `🌐 Gateway: **${Math.round(client.ws.ping)}ms**\n` +
          `🎧 Voz: **${voice ? voice.state.status : 'desconectado'}**\n` +
          `🧠 Heap: **${heapMb} MB**\n` +
          `💾 RAM RSS: **${rssMb} MB**\n` +
          `🟩 Node.js: **${process.version}**\n` +
          `📦 discord.js: **${discordJsVersion}**\n` +
          `🧹 CleanMakki timers: **${makkiTimers.size}**`
        );

        return;
      }

      // /help
      if (
        command === 'help'
      ) {
        await interaction.reply(
          `🤖 **Polaco Guardian — Comandos**\n\n` +

          `**🌐 Públicos**\n` +
          `\`/polaco\` — verifica se o bot está ativo\n` +
          `\`/ping\` — mostra a latência\n` +
          `\`/status\` — status técnico do bot\n` +
          `\`/dk\` — informações do servidor\n` +
          `\`/avatar\` — mostra um avatar\n` +
          `\`/userinfo\` — informações de usuário\n\n` +

          `**🎧 Guardian / Voz**\n` +
          `\`/guardian\` — conecta na sua call\n` +
          `\`/guardianstatus\` — status da conexão\n` +
          `\`/leave\` — desconecta (Admin)\n\n` +

          `**🛡️ Administração**\n` +
          `\`/falar\` — faz o Guardian enviar uma mensagem\n` +
          `\`/say\` — alias do /falar\n` +
          `\`/cleanmakki\` — remove mensagem do Makki\n` +
          `\`/cleanmakkistatus\` — status do CleanMakki`
        );

        return;
      }

      // /dk
      if (
        command === 'dk'
      ) {
        const guild =
          interaction.guild;

        await interaction.reply(
          `🏰 **${guild.name}**\n` +
          `👥 Membros: **${guild.memberCount}**\n` +
          `🆔 ID: \`${guild.id}\`\n` +
          `👑 Dono: <@${guild.ownerId}>`
        );

        return;
      }

      // /avatar
      if (
        command === 'avatar'
      ) {
        const user =
          interaction.options
            .getUser('usuario') ||
          interaction.user;

        const avatar =
          user.displayAvatarURL({
            size: 1024,
            extension: 'png'
          });

        await interaction.reply(
          `🖼️ **Avatar de ${user.username}:**\n${avatar}`
        );

        return;
      }

      // /userinfo
      if (
        command === 'userinfo'
      ) {
        const user =
          interaction.options
            .getUser('usuario') ||
          interaction.user;

        let member = null;

        try {
          member =
            await interaction.guild
              .members.fetch(
                user.id
              );
        } catch {}

        const created =
          Math.floor(
            user.createdTimestamp /
              1000
          );

        let response =
          `👤 **Informações de ${user.username}**\n` +
          `🆔 ID: \`${user.id}\`\n` +
          `🤖 Bot: **${user.bot ? 'Sim' : 'Não'}**\n` +
          `📅 Conta criada: <t:${created}:F>`;

        if (
          member?.joinedTimestamp
        ) {
          response +=
            `\n📥 Entrou no servidor: <t:${Math.floor(
              member.joinedTimestamp /
                1000
            )}:F>`;
        }

        await interaction.reply(
          response
        );

        return;
      }

      // /say + /falar
      if (
        command === 'say' ||
        command === 'falar'
      ) {
        if (
          !(await requireAdmin(
            interaction
          ))
        ) {
          return;
        }

        const text =
          interaction.options
            .getString('texto');

        if (!text) {
          await interaction.reply({
            content:
              '❌ Não encontrei o texto informado. Digite novamente o comando.',
            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        await interaction.reply({
          content:
            '✅ Mensagem enviada.',
          flags:
            MessageFlags.Ephemeral
        });

        await interaction.channel.send({
          content: text,
          allowedMentions: {
            parse: []
          }
        });

        return;
      }

      // /cleanmakki
      if (
        command === 'cleanmakki'
      ) {
        if (
          !(await requireAdmin(
            interaction
          ))
        ) {
          return;
        }

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const result =
          await manualCleanMakki();

        if (
          result.success
        ) {
          await interaction.editReply(
            `✅ Mensagem do Makki removida.\nID: \`${result.messageId}\``
          );

        } else {
          await interaction.editReply(
            `ℹ️ ${result.message}`
          );
        }

        return;
      }

      // /cleanmakkistatus
      if (
        command ===
        'cleanmakkistatus'
      ) {
        if (
          makkiTimers.size === 0
        ) {
          await interaction.reply(
            '🧹 **CleanMakki:** nenhuma mensagem atualmente agendada.'
          );

          return;
        }

        const rows = [];

        for (
          const [
            id,
            data
          ]
          of makkiTimers
        ) {
          const remaining =
            Math.max(
              data.deleteAt -
                Date.now(),
              0
            );

          rows.push(
            `• \`${id}\` — faltam **${formatDuration(remaining)}**`
          );
        }

        await interaction.reply(
          `🧹 **CleanMakki Status**\n` +
          `Timers ativos: **${makkiTimers.size}**\n\n` +
          rows.join('\n')
        );

        return;
      }

    } catch (err) {
      errorLog(
        'COMMAND',
        `/${command} failed`,
        err
      );

      const text =
        `❌ Ocorreu um erro ao executar **/${command}**.\n\`${err.message || err}\``;

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .editReply(text)
          .catch(() => {});

      } else {
        await interaction
          .reply({
            content: text,
            flags:
              MessageFlags.Ephemeral
          })
          .catch(() => {});
      }
    }
  }
);

// ======================================================
// MESSAGE CREATE + DEBUG
// ======================================================

client.on(
  Events.MessageCreate,
  async message => {

    await handleDeveloperMention(
      message
    );

    if (
      message.channel.id !==
      MAKKI_CHANNEL
    ) {
      return;
    }

    /*
    Agora qualquer mensagem do Makki no canal correto
    será diagnosticada, mesmo que NÃO passe no filtro.
    */

    if (
      message.author.id ===
      MAKKI_ID
    ) {
      log(
        'CLEANMAKKI',
        `Makki message received | ${message.id}`
      );

      logMakkiDebug(
        message,
        'messageCreate'
      );
    }

    if (
      !isMakkiMessage(
        message
      )
    ) {
      if (
        message.author.id ===
        MAKKI_ID
      ) {
        log(
          'CLEANMAKKI',
          'Makki message ignored: not target message'
        );
      }

      return;
    }

    log(
      'CLEANMAKKI',
      `Automatic Makki message detected | ${message.id} ✅`
    );

    lastMakkiMessage =
      message;

    scheduleMakkiDeletion(
      message,
      DELETE_DELAY
    );
  }
);

// ======================================================
// HELPERS
// ======================================================

function formatDuration(ms) {
  const totalSeconds =
    Math.max(
      0,
      Math.floor(ms / 1000)
    );

  const days =
    Math.floor(
      totalSeconds / 86400
    );

  const hours =
    Math.floor(
      (
        totalSeconds % 86400
      ) / 3600
    );

  const minutes =
    Math.floor(
      (
        totalSeconds % 3600
      ) / 60
    );

  const seconds =
    totalSeconds % 60;

  const parts = [];

  if (days) {
    parts.push(`${days}d`);
  }

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes) {
    parts.push(`${minutes}m`);
  }

  if (
    seconds ||
    parts.length === 0
  ) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

// ======================================================
// DISCORD PREFLIGHT
// ======================================================

async function discordPreflight() {
  log(
    'STARTUP',
    'Testing Discord REST API...'
  );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      15000
    );

  try {
    const response =
      await fetch(
        'https://discord.com/api/v10/users/@me',
        {
          headers: {
            Authorization:
              `Bot ${TOKEN}`
          },

          signal:
            controller.signal
        }
      );

    log(
      'STARTUP',
      `Discord REST HTTP ${response.status}`
    );

    if (
      response.status === 429
    ) {
      const body =
        await response.text();

      if (
        body.includes('1015') ||
        body.includes(
          'temporarily'
        )
      ) {
        throw new Error(
          'Discord/Cloudflare bloqueou temporariamente o IP do Render (HTTP 429 / Error 1015).'
        );
      }

      throw new Error(
        'Discord respondeu HTTP 429 (rate limit).'
      );
    }

    if (
      response.status === 401
    ) {
      throw new Error(
        'TOKEN inválido ou expirado.'
      );
    }

    if (!response.ok) {
      throw new Error(
        `Discord REST retornou HTTP ${response.status}.`
      );
    }

    const bot =
      await response.json();

    if (
      String(bot.id) !==
      String(CLIENT_ID)
    ) {
      throw new Error(
        `CLIENT_ID não corresponde ao TOKEN. Token ID=${bot.id} | CLIENT_ID=${CLIENT_ID}`
      );
    }

    log(
      'STARTUP',
      `Authenticated as ${bot.username} (${bot.id}) ✅`
    );

    log(
      'STARTUP',
      'TOKEN + CLIENT_ID OK ✅'
    );

  } finally {
    clearTimeout(timer);
  }
}

// ======================================================
// DISCORD EVENTS
// ======================================================

client.on('error', err => {
  errorLog(
    'DISCORD',
    'Client error',
    err
  );
});

client.on('warn', info => {
  warn(
    'DISCORD',
    info
  );
});

client.on(
  'shardError',
  (err, shardId) => {
    errorLog(
      'SHARD',
      `Shard ${shardId} error`,
      err
    );
  }
);

client.on(
  'shardDisconnect',
  (event, shardId) => {
    warn(
      'SHARD',
      `Shard ${shardId} disconnected | Code ${event.code}`
    );
  }
);

client.on(
  'shardReconnecting',
  shardId => {
    warn(
      'SHARD',
      `Shard ${shardId} reconnecting...`
    );
  }
);

client.on(
  'shardResume',
  (shardId, replayedEvents) => {
    log(
      'SHARD',
      `Shard ${shardId} resumed | ${replayedEvents} replayed event(s) ✅`
    );
  }
);

client.on(
  'shardReady',
  shardId => {
    log(
      'SHARD',
      `Shard ${shardId} ready ✅`
    );
  }
);

// ======================================================
// PROCESS ERRORS
// ======================================================

process.on(
  'unhandledRejection',
  err => {
    errorLog(
      'PROCESS',
      'Unhandled rejection',
      err
    );
  }
);

process.on(
  'uncaughtException',
  err => {
    errorLog(
      'PROCESS',
      'Uncaught exception',
      err
    );
  }
);

// ======================================================
// SHUTDOWN
// ======================================================

function shutdown(signal) {
  log(
    'SYSTEM',
    `${signal} received. Shutting down...`
  );

  for (
    const data
    of makkiTimers.values()
  ) {
    if (data?.timer) {
      clearTimeout(
        data.timer
      );
    }
  }

  makkiTimers.clear();

  for (
    const player
    of voicePlayers.values()
  ) {
    try {
      player.stop(true);
    } catch {}
  }

  voicePlayers.clear();
  voiceChannels.clear();

  try {
    client.destroy();
  } catch {}

  try {
    server.close();
  } catch {}

  setTimeout(
    () =>
      process.exit(0),
    500
  );
}

process.on(
  'SIGTERM',
  () =>
    shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () =>
    shutdown('SIGINT')
);

// ======================================================
// START BOT
// ======================================================

async function startBot() {
  try {
    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      '       POLACO GUARDIAN STARTING'
    );

    console.log(
      '======================================'
    );

    if (!TOKEN) {
      throw new Error(
        'TOKEN não configurado.'
      );
    }

    if (!CLIENT_ID) {
      throw new Error(
        'CLIENT_ID não configurado.'
      );
    }

    if (!GUILD_ID) {
      throw new Error(
        'GUILD_ID não configurado.'
      );
    }

    log(
      'STARTUP',
      'Environment variables OK ✅'
    );

    log(
      'STARTUP',
      `CLIENT_ID: ${CLIENT_ID}`
    );

    log(
      'STARTUP',
      `GUILD_ID: ${GUILD_ID}`
    );

    log(
      'STARTUP',
      'Initializing libsodium...'
    );

    await sodium.ready;

    log(
      'STARTUP',
      'libsodium ready ✅'
    );

    await discordPreflight();

    log(
      'STARTUP',
      'Connecting to Discord Gateway...'
    );

    const LOGIN_TIMEOUT =
      45000;

    let timeoutId;

    const timeoutPromise =
      new Promise(
        (_, reject) => {
          timeoutId =
            setTimeout(
              () => {
                reject(
                  new Error(
                    'Discord Gateway login timeout after 45 seconds.'
                  )
                );
              },
              LOGIN_TIMEOUT
            );
        }
      );

    await Promise.race([
      client.login(TOKEN),
      timeoutPromise
    ]);

    clearTimeout(
      timeoutId
    );

    log(
      'STARTUP',
      'Discord login completed ✅'
    );

  } catch (err) {
    console.log('');
    console.log(
      '======================================'
    );

    errorLog(
      'STARTUP',
      err.message || err
    );

    console.log(
      '======================================'
    );

    try {
      client.destroy();
    } catch {}

    setTimeout(
      () =>
        process.exit(1),
      3000
    );
  }
}

startBot();
