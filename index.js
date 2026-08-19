/*
Polaco Guardian - Diagnóstico de conexão 2026
Commands: /guardian, /leave, /polaco, /dk
Voz: /guardian conecta e toca silêncio contínuo
CleanMakki: remove mensagens após 2 horas
*/

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder
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
// ENVIRONMENT VARIABLES
// ======================================================

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const PORT = process.env.PORT || 10000;

// Canal onde o Makki envia a mensagem
const MAKKI_CHANNEL = '1300277158165614699';

// ======================================================
// DISCORD CLIENT
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
// DISCORD / GATEWAY LOGS
// ======================================================

// NÃO usamos client.on('debug') porque ele pode imprimir token nos logs.

client.on('warn', warning => {
  console.warn('[DISCORD WARNING]', warning);
});

client.on('error', error => {
  console.error('[DISCORD CLIENT ERROR]', error);
});

client.on('shardError', (error, shardId) => {
  console.error(
    `[SHARD ERROR] Shard ${shardId ?? 0}:`,
    error
  );
});

client.on('shardDisconnect', (event, shardId) => {
  console.error(
    `[SHARD DISCONNECT] Shard ${shardId}`
  );

  console.error(
    `[SHARD DISCONNECT] Code: ${event.code}`
  );

  console.error(
    `[SHARD DISCONNECT] Reason: ${event.reason || 'sem motivo informado'}`
  );

  console.error(
    `[SHARD DISCONNECT] Clean: ${event.wasClean}`
  );
});

client.on('shardReconnecting', shardId => {
  console.warn(
    `[SHARD] Reconnecting shard ${shardId}...`
  );
});

client.on('shardResume', (shardId, replayedEvents) => {
  console.log(
    `[SHARD] Resumed shard ${shardId} | ${replayedEvents} replayed event(s) ✅`
  );
});

client.on('shardReady', shardId => {
  console.log(
    `[SHARD] Shard ${shardId} ready ✅`
  );
});

// ======================================================
// EXPRESS / RENDER
// ======================================================

const app = express();

app.get('/', (req, res) => {
  res.status(200).send(
    'Polaco Guardian is alive ✅'
  );
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    discordReady: client.isReady(),
    bot: client.user?.tag || null,
    uptime: Math.floor(process.uptime())
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[SERVER] Listening on port ${PORT} ✅`
  );
});

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName('guardian')
    .setDescription('Conecta o Polaco Guardian ao seu canal de voz'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Desconecta o Polaco Guardian do canal de voz'),

  new SlashCommandBuilder()
    .setName('polaco')
    .setDescription('Verifica se o Polaco Guardian está ativo'),

  new SlashCommandBuilder()
    .setName('dk')
    .setDescription('Mostra informações do servidor')
].map(command => command.toJSON());

async function registerCommands() {
  try {
    console.log('[SLASH] Registering commands...');

    const rest = new REST({
      version: '10'
    }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(
        CLIENT_ID,
        GUILD_ID
      ),
      {
        body: commands
      }
    );

    console.log(
      '[SLASH] Commands registered ✅'
    );

  } catch (error) {
    console.error(
      '[SLASH ERROR]',
      error
    );
  }
}

// ======================================================
// SILENT AUDIO
// ======================================================

function getSilentAudioPath() {
  const mp3 = path.join(
    __dirname,
    'silence.mp3'
  );

  const wav = path.join(
    __dirname,
    'silence.wav'
  );

  if (fs.existsSync(mp3)) {
    return mp3;
  }

  if (fs.existsSync(wav)) {
    return wav;
  }

  throw new Error(
    'Arquivo silence.mp3 ou silence.wav não encontrado.'
  );
}

// ======================================================
// VOICE CONNECTION
// ======================================================

async function connectVoice(member) {
  const channel = member.voice?.channel;

  if (!channel) {
    throw new Error(
      'Você não está em um canal de voz.'
    );
  }

  console.log(
    `[VOICE] Connecting to "${channel.name}" (${channel.id})...`
  );

  const existingConnection =
    getVoiceConnection(channel.guild.id);

  if (existingConnection) {
    console.log(
      '[VOICE] Existing connection found. Destroying...'
    );

    existingConnection.destroy();
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false
  });

  connection.on(
    'stateChange',
    (oldState, newState) => {
      console.log(
        `[VOICE STATE] ${oldState.status} -> ${newState.status}`
      );
    }
  );

  connection.on('error', error => {
    console.error(
      '[VOICE CONNECTION ERROR]',
      error
    );
  });

  try {
    await entersState(
      connection,
      VoiceConnectionStatus.Ready,
      30_000
    );

    console.log(
      '[VOICE] Connection ready ✅'
    );

  } catch (error) {
    console.error(
      '[VOICE] Failed to reach Ready:',
      error
    );

    try {
      connection.destroy();
    } catch {}

    throw new Error(
      'Não foi possível estabelecer a conexão de voz.'
    );
  }

  // ====================================================
  // AUDIO PLAYER
  // ====================================================

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber:
        NoSubscriberBehavior.Play
    }
  });

  player.on('error', error => {
    console.error(
      '[AUDIO ERROR]',
      error
    );
  });

  function playLoop() {
    try {
      const silentFile =
        getSilentAudioPath();

      const resource =
        createAudioResource(silentFile);

      player.play(resource);

    } catch (error) {
      console.error(
        '[VOICE] Could not start silent audio:',
        error.message || error
      );
    }
  }

  player.on(
    AudioPlayerStatus.Playing,
    () => {
      console.log(
        '[VOICE] Silent audio playing ✅'
      );
    }
  );

  player.on(
    AudioPlayerStatus.Idle,
    () => {
      setTimeout(() => {
        playLoop();
      }, 500);
    }
  );

  connection.subscribe(player);
  playLoop();

  console.log(
    `[VOICE] Connected to "${channel.name}" ✅`
  );

  return connection;
}

// ======================================================
// CLEAN MAKKI
// ======================================================

const DELETE_DELAY =
  2 * 60 * 60 * 1000;

const MAKKI_PATTERNS = [
  'Vocês gostam da nossa comunidade',
  'DK',
  'convide seus amigos'
];

let lastMakkiMessage = null;

function isMakkiMessage(message) {
  if (!message?.content) {
    return false;
  }

  return MAKKI_PATTERNS.every(
    pattern =>
      message.content.includes(pattern)
  );
}

// ======================================================
// CLEAN MAKKI - SCHEDULE
// ======================================================

function scheduleMakkiDeletion(
  message,
  delayMs
) {
  const deleteTime =
    new Date(Date.now() + delayMs);

  console.log(
    `[CLEANMAKKI] Scheduled deletion: ${deleteTime.toLocaleString(
      'pt-BR',
      {
        timeZone: 'America/Sao_Paulo'
      }
    )}`
  );

  console.log(
    `[CLEANMAKKI] Message: "${message.content.slice(
      0,
      70
    )}..."`
  );

  setTimeout(async () => {
    try {
      await message.delete();

      console.log(
        `[CLEANMAKKI] Message deleted ✅ | ID: ${message.id}`
      );

      if (
        lastMakkiMessage?.id ===
        message.id
      ) {
        lastMakkiMessage = null;
      }

    } catch (error) {
      if (error?.code === 10008) {
        console.log(
          `[CLEANMAKKI] Message ${message.id} was already deleted.`
        );

        return;
      }

      console.error(
        `[CLEANMAKKI] Could not delete ${message.id}:`,
        error.message || error
      );
    }
  }, delayMs);
}

// ======================================================
// CLEAN MAKKI STARTUP
// ======================================================

async function cleanMakkiOnStartup(
  channel
) {
  try {
    console.log(
      '[CLEANMAKKI] Checking previous messages...'
    );

    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const makkiMessages =
      messages
        .filter(message =>
          message.author.bot &&
          isMakkiMessage(message)
        )
        .sort(
          (a, b) =>
            b.createdTimestamp -
            a.createdTimestamp
        );

    console.log(
      `[CLEANMAKKI] Found ${makkiMessages.size} matching message(s).`
    );

    let first = true;

    for (const message of makkiMessages.values()) {
      if (first) {
        lastMakkiMessage = message;
        first = false;
      }

      const age =
        Date.now() -
        message.createdTimestamp;

      const remainingDelay =
        Math.max(
          DELETE_DELAY - age,
          0
        );

      scheduleMakkiDeletion(
        message,
        remainingDelay
      );
    }

    console.log(
      '[CLEANMAKKI] Startup scan complete ✅'
    );

  } catch (error) {
    console.error(
      '[CLEANMAKKI STARTUP ERROR]',
      error
    );
  }
}

// ======================================================
// BOT READY
// ======================================================

client.once('ready', async readyClient => {
  console.log('');
  console.log(
    '======================================'
  );

  console.log(
    `[BOT] Logged in as ${readyClient.user.tag} ✅`
  );

  console.log(
    `[BOT] ID: ${readyClient.user.id}`
  );

  console.log(
    `[BOT] Guilds: ${readyClient.guilds.cache.size}`
  );

  console.log(
    '======================================'
  );
  console.log('');

  await registerCommands();

  try {
    readyClient.user.setPresence({
      activities: [
        {
          name: 'Battlefield 6 🔥',
          type: ActivityType.Playing
        }
      ],
      status: 'dnd'
    });

    console.log(
      '[BOT] Presence configured ✅'
    );

  } catch (error) {
    console.error(
      '[PRESENCE ERROR]',
      error
    );
  }

  try {
    const channel =
      await readyClient.channels.fetch(
        MAKKI_CHANNEL
      );

    if (
      channel &&
      channel.isTextBased()
    ) {
      console.log(
        `[CLEANMAKKI] Channel found: ${channel.name} ✅`
      );

      await cleanMakkiOnStartup(
        channel
      );

    } else {
      console.warn(
        '[CLEANMAKKI] Configured channel is not text based.'
      );
    }

  } catch (error) {
    console.error(
      '[CLEANMAKKI] Channel fetch failed:',
      error.message || error
    );
  }
});

// ======================================================
// INTERACTIONS
// ======================================================

client.on(
  'interactionCreate',
  async interaction => {

    if (
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const command =
      interaction.commandName;

    // /guardian
    if (command === 'guardian') {
      try {
        await interaction.deferReply({
          ephemeral: true
        });

        await connectVoice(
          interaction.member
        );

        await interaction.editReply(
          '✅ Polaco Guardian conectado ao canal de voz.'
        );

      } catch (error) {
        console.error(
          '[GUARDIAN ERROR]',
          error
        );

        const message =
          `❌ Falha ao conectar: ${
            error.message || error
          }`;

        if (
          interaction.deferred ||
          interaction.replied
        ) {
          await interaction
            .editReply(message)
            .catch(() => {});
        } else {
          await interaction
            .reply({
              content: message,
              ephemeral: true
            })
            .catch(() => {});
        }
      }

      return;
    }

    // /leave
    if (command === 'leave') {
      const connection =
        getVoiceConnection(
          interaction.guild.id
        );

      if (connection) {
        connection.destroy();

        console.log(
          `[VOICE] Disconnected from guild ${interaction.guild.id}`
        );

        await interaction.reply({
          content:
            '👋 Desconectado do canal de voz.',
          ephemeral: true
        });

      } else {
        await interaction.reply({
          content:
            '❌ Não estou conectado a nenhum canal de voz.',
          ephemeral: true
        });
      }

      return;
    }

    // /polaco
    if (command === 'polaco') {
      await interaction.reply(
        'Polaco Guardian está ativo! ✅'
      );

      return;
    }

    // /dk
    if (command === 'dk') {
      const guild =
        interaction.guild;

      await interaction.reply(
        `Servidor: ${guild.name} | ID: ${guild.id} | Membros: ${guild.memberCount}`
      );

      return;
    }
  }
);

// ======================================================
// MESSAGE CREATE / CLEAN MAKKI
// ======================================================

client.on(
  'messageCreate',
  async message => {

    if (
      message.channel.id !==
      MAKKI_CHANNEL
    ) {
      return;
    }

    if (
      !message.author.bot ||
      !isMakkiMessage(message)
    ) {
      return;
    }

    console.log(
      `[CLEANMAKKI] New Makki message detected ✅ | ID: ${message.id}`
    );

    if (
      lastMakkiMessage &&
      lastMakkiMessage.id !==
        message.id
    ) {
      try {
        await lastMakkiMessage.delete();

        console.log(
          '[CLEANMAKKI] Previous Makki message deleted ✅'
        );

      } catch (error) {
        if (error?.code !== 10008) {
          console.error(
            '[CLEANMAKKI] Could not delete previous message:',
            error.message || error
          );
        }
      }
    }

    lastMakkiMessage =
      message;

    scheduleMakkiDeletion(
      message,
      DELETE_DELAY
    );
  }
);

// ======================================================
// PROCESS ERROR LOGGING
// ======================================================

process.on(
  'unhandledRejection',
  error => {
    console.error(
      '[UNHANDLED REJECTION]',
      error
    );
  }
);

process.on(
  'uncaughtException',
  error => {
    console.error(
      '[UNCAUGHT EXCEPTION]',
      error
    );
  }
);

// ======================================================
// GRACEFUL SHUTDOWN
// ======================================================

function shutdown(signal) {
  console.log(
    `[SYSTEM] ${signal} received. Shutting down...`
  );

  try {
    client.destroy();
  } catch {}

  try {
    server.close();
  } catch {}

  process.exit(0);
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

// ======================================================
// DISCORD REST TEST
// ======================================================

async function testDiscordRest() {
  console.log(
    '[STARTUP] Testing Discord REST authentication...'
  );

  const response = await fetch(
    'https://discord.com/api/v10/users/@me',
    {
      headers: {
        Authorization: `Bot ${TOKEN}`
      }
    }
  );

  console.log(
    `[REST TEST] HTTP ${response.status}`
  );

  if (!response.ok) {
    const body =
      await response.text();

    console.error(
      '[REST TEST] Discord response:',
      body
    );

    throw new Error(
      `Discord authentication failed: HTTP ${response.status}`
    );
  }

  const botInfo =
    await response.json();

  console.log(
    `[REST TEST] Authenticated as ${botInfo.username} (${botInfo.id}) ✅`
  );

  if (
    String(botInfo.id) !==
    String(CLIENT_ID)
  ) {
    console.warn(
      '[REST TEST WARNING] CLIENT_ID does not match the bot token!'
    );

    console.warn(
      `[REST TEST WARNING] TOKEN bot ID: ${botInfo.id}`
    );

    console.warn(
      `[REST TEST WARNING] CLIENT_ID: ${CLIENT_ID}`
    );
  } else {
    console.log(
      '[REST TEST] TOKEN and CLIENT_ID match ✅'
    );
  }
}

// ======================================================
// DISCORD GATEWAY REST TEST
// ======================================================

async function testDiscordGatewayEndpoint() {
  console.log(
    '[STARTUP] Testing Discord Gateway endpoint...'
  );

  const response = await fetch(
    'https://discord.com/api/v10/gateway/bot',
    {
      headers: {
        Authorization: `Bot ${TOKEN}`
      }
    }
  );

  console.log(
    `[GATEWAY TEST] HTTP ${response.status}`
  );

  if (!response.ok) {
    const body =
      await response.text();

    console.error(
      '[GATEWAY TEST] Discord response:',
      body
    );

    throw new Error(
      `Discord Gateway endpoint failed: HTTP ${response.status}`
    );
  }

  const gatewayInfo =
    await response.json();

  console.log(
    `[GATEWAY TEST] URL: ${gatewayInfo.url}`
  );

  console.log(
    `[GATEWAY TEST] Recommended shards: ${gatewayInfo.shards}`
  );

  console.log(
    '[GATEWAY TEST] Gateway information received ✅'
  );
}

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

    // ==================================================
    // CHECK ENVIRONMENT
    // ==================================================

    if (!TOKEN) {
      throw new Error(
        'TOKEN não encontrado nas variáveis de ambiente.'
      );
    }

    if (!CLIENT_ID) {
      throw new Error(
        'CLIENT_ID não encontrado nas variáveis de ambiente.'
      );
    }

    if (!GUILD_ID) {
      throw new Error(
        'GUILD_ID não encontrado nas variáveis de ambiente.'
      );
    }

    console.log(
      '[STARTUP] Environment variables OK ✅'
    );

    console.log(
      `[STARTUP] CLIENT_ID: ${CLIENT_ID}`
    );

    console.log(
      `[STARTUP] GUILD_ID: ${GUILD_ID}`
    );

    console.log(
      `[STARTUP] TOKEN present: YES (${TOKEN.length} characters)`
    );

    // ==================================================
    // LIBSODIUM
    // ==================================================

    console.log(
      '[STARTUP] Initializing libsodium...'
    );

    await sodium.ready;

    console.log(
      '[STARTUP] libsodium ready ✅'
    );

    // ==================================================
    // TEST 1 - DISCORD REST
    // ==================================================

    await testDiscordRest();

    // ==================================================
    // TEST 2 - GATEWAY REST ENDPOINT
    // ==================================================

    await testDiscordGatewayEndpoint();

    // ==================================================
    // LOGIN / WEBSOCKET
    // ==================================================

    console.log(
      '[STARTUP] Opening Discord Gateway/WebSocket connection...'
    );

    const LOGIN_TIMEOUT =
      45_000;

    let timeoutId;

    const timeoutPromise =
      new Promise((_, reject) => {
        timeoutId =
          setTimeout(() => {
            reject(
              new Error(
                `Discord Gateway login timeout after ${LOGIN_TIMEOUT / 1000} seconds`
              )
            );
          }, LOGIN_TIMEOUT);
      });

    try {
      const loginResult =
        await Promise.race([
          client.login(TOKEN),
          timeoutPromise
        ]);

      clearTimeout(timeoutId);

      console.log(
        '[STARTUP] client.login() completed ✅'
      );

      console.log(
        `[STARTUP] Login result: ${loginResult}`
      );

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }

  } catch (error) {
    console.error('');
    console.error(
      '======================================'
    );

    console.error(
      '[STARTUP ERROR]'
    );

    console.error(error);

    console.error(
      '======================================'
    );

    try {
      client.destroy();
    } catch {}

    setTimeout(() => {
      process.exit(1);
    }, 3000);
  }
}

// ======================================================
// START
// ======================================================

startBot();
