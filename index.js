/*
Polaco Guardian - Atualizado
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
// EXPRESS / RENDER KEEPALIVE
// ======================================================

const app = express();

app.get('/', (req, res) => {
  res.send('Polaco Guardian is alive ✅');
});

app.listen(PORT, () => {
  console.log(`[SERVER] Listening on port ${PORT}`);
});

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [
  new SlashCommandBuilder()
    .setName('guardian')
    .setDescription('Conecta o bot no seu canal de voz'),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Desconecta o bot do canal de voz'),

  new SlashCommandBuilder()
    .setName('polaco')
    .setDescription('Polaco Guardian está ativo! ✅'),

  new SlashCommandBuilder()
    .setName('dk')
    .setDescription('Mostra informações do servidor')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('[SLASH] Registering commands...');

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      {
        body: commands
      }
    );

    console.log('[SLASH] Commands registered ✅');
  } catch (error) {
    console.error('[SLASH ERROR]', error);
  }
}

// ======================================================
// SILENT AUDIO
// ======================================================

function getSilentAudioPath() {
  const mp3 = path.join(__dirname, 'silence.mp3');
  const wav = path.join(__dirname, 'silence.wav');

  if (fs.existsSync(mp3)) {
    return mp3;
  }

  if (fs.existsSync(wav)) {
    return wav;
  }

  throw new Error(
    'Arquivo de silêncio não encontrado. Adicione silence.mp3 ou silence.wav.'
  );
}

// ======================================================
// VOICE CONNECTION
// ======================================================

async function connectVoice(member) {
  const channel = member.voice?.channel;

  if (!channel) {
    throw new Error('Você não está em um canal de voz.');
  }

  console.log(
    `[VOICE] Tentando conectar em "${channel.name}" (${channel.id})...`
  );

  // Se já houver uma conexão antiga nesse servidor, destrói primeiro
  const existingConnection = getVoiceConnection(channel.guild.id);

  if (existingConnection) {
    console.log('[VOICE] Existing connection found. Destroying...');
    existingConnection.destroy();
  }

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,

    // Bot continua ouvindo o canal.
    // Se quiser que fique surdo, altere para true.
    selfDeaf: false,

    // Bot permanece mutado porque só precisamos mantê-lo conectado.
    selfMute: false
  });

  // Logs úteis de mudança de estado
  connection.on('stateChange', (oldState, newState) => {
    console.log(
      `[VOICE STATE] ${oldState.status} -> ${newState.status}`
    );
  });

  connection.on('error', error => {
    console.error('[VOICE CONNECTION ERROR]', error);
  });

  try {
    await entersState(
      connection,
      VoiceConnectionStatus.Ready,
      30_000
    );

    console.log('[VOICE] Connection ready ✅');
  } catch (error) {
    console.error(
      '[VOICE] Connection did not reach Ready:',
      error.message || error
    );

    connection.destroy();

    throw new Error(
      'Não foi possível estabelecer a conexão de voz.'
    );
  }

  // ====================================================
  // AUDIO PLAYER
  // ====================================================

  const player = createAudioPlayer({
    behaviors: {
      noSubscriber: NoSubscriberBehavior.Play
    }
  });

  player.on('error', error => {
    console.error('[AUDIO ERROR]', error);
  });

  function playLoop() {
    try {
      const silentFile = getSilentAudioPath();

      const resource = createAudioResource(silentFile);

      player.play(resource);

      console.log('[VOICE] Silent audio started');
    } catch (error) {
      console.error(
        '[VOICE] Error starting silent audio:',
        error.message || error
      );
    }
  }

  player.on(AudioPlayerStatus.Playing, () => {
    console.log('[VOICE] Silent audio playing ✅');
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log('[VOICE] Silent audio ended. Restarting...');

    setTimeout(() => {
      playLoop();
    }, 500);
  });

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

const DELETE_DELAY = 2 * 60 * 60 * 1000; // 2 horas

const MAKKI_PATTERNS = [
  'Vocês gostam da nossa comunidade',
  'DK',
  'convide seus amigos'
];

let lastMakkiMessage = null;

function isMakkiMessage(message) {
  if (!message || !message.content) {
    return false;
  }

  return MAKKI_PATTERNS.every(pattern =>
    message.content.includes(pattern)
  );
}

function scheduleMakkiDeletion(message, delayMs) {
  const deleteTime = new Date(Date.now() + delayMs);

  console.log(
    `[CLEANMAKKI] Scheduled deletion at ${deleteTime.toLocaleTimeString(
      'pt-BR'
    )} | "${message.content.slice(0, 50)}..."`
  );

  setTimeout(async () => {
    try {
      await message.delete();

      console.log(
        `[CLEANMAKKI] Message deleted ✅ | ID: ${message.id}`
      );

      if (
        lastMakkiMessage &&
        lastMakkiMessage.id === message.id
      ) {
        lastMakkiMessage = null;
      }
    } catch (error) {
      console.log(
        `[CLEANMAKKI] Could not delete message ${message.id}:`,
        error.message || error
      );
    }
  }, delayMs);
}

// ======================================================
// CLEAN MAKKI STARTUP
// ======================================================

async function cleanMakkiOnStartup(channel) {
  try {
    console.log('[CLEANMAKKI] Checking previous messages...');

    const messages = await channel.messages.fetch({
      limit: 100
    });

    let found = 0;

    messages.forEach(message => {
      if (
        message.author.bot &&
        isMakkiMessage(message)
      ) {
        found++;

        const age =
          Date.now() - message.createdTimestamp;

        const remainingDelay =
          Math.max(DELETE_DELAY - age, 0);

        scheduleMakkiDeletion(
          message,
          remainingDelay
        );
      }
    });

    console.log(
      `[CLEANMAKKI] Startup scan complete. ${found} message(s) found.`
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

client.once('ready', async () => {
  console.log('');
  console.log('======================================');
  console.log(`[BOT] Logged in as ${client.user.tag} ✅`);
  console.log(`[BOT] ID: ${client.user.id}`);
  console.log('======================================');
  console.log('');

  // Slash commands
  await registerCommands();

  // Presence
  client.user.setPresence({
    activities: [
      {
        name: 'Battlefield 6 🔥',
        type: ActivityType.Playing
      }
    ],
    status: 'dnd'
  });

  console.log('[BOT] Presence configured ✅');

  // CleanMakki
  try {
    const channel =
      await client.channels.fetch(MAKKI_CHANNEL);

    if (channel && channel.isTextBased()) {
      console.log(
        `[CLEANMAKKI] Channel found: ${channel.name}`
      );

      await cleanMakkiOnStartup(channel);
    } else {
      console.warn(
        '[CLEANMAKKI] Configured channel is not a text channel.'
      );
    }
  } catch (error) {
    console.error(
      '[CLEANMAKKI] Channel not found:',
      error.message || error
    );
  }
});

// ======================================================
// SLASH COMMAND HANDLER
// ======================================================

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = interaction.commandName;

  // ----------------------------------------------------
  // /guardian
  // ----------------------------------------------------

  if (command === 'guardian') {
    await interaction.deferReply({
      ephemeral: true
    });

    try {
      await connectVoice(interaction.member);

      await interaction.editReply(
        '✅ Polaco Guardian conectado ao canal de voz.'
      );
    } catch (error) {
      console.error(
        '[GUARDIAN ERROR]',
        error
      );

      await interaction.editReply(
        `❌ Falha ao conectar: ${
          error.message || error
        }`
      );
    }

    return;
  }

  // ----------------------------------------------------
  // /leave
  // ----------------------------------------------------

  if (command === 'leave') {
    const connection =
      getVoiceConnection(interaction.guild.id);

    if (connection) {
      connection.destroy();

      console.log(
        `[VOICE] Disconnected from guild ${interaction.guild.id}`
      );

      await interaction.reply({
        content: '👋 Desconectado do canal de voz.',
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

  // ----------------------------------------------------
  // /polaco
  // ----------------------------------------------------

  if (command === 'polaco') {
    await interaction.reply(
      'Polaco Guardian está ativo! ✅'
    );

    return;
  }

  // ----------------------------------------------------
  // /dk
  // ----------------------------------------------------

  if (command === 'dk') {
    const guild = interaction.guild;

    await interaction.reply(
      `Servidor: ${guild.name} | ID: ${guild.id} | Membros: ${guild.memberCount}`
    );

    return;
  }
});

// ======================================================
// MESSAGE CREATE / CLEAN MAKKI
// ======================================================

client.on('messageCreate', async message => {
  // Ignora tudo fora do canal configurado
  if (message.channel.id !== MAKKI_CHANNEL) {
    return;
  }

  if (
    message.author.bot &&
    isMakkiMessage(message)
  ) {
    console.log(
      `[CLEANMAKKI] New Makki message detected | ID: ${message.id}`
    );

    // Se existir uma mensagem anterior salva, tenta removê-la
    if (
      lastMakkiMessage &&
      lastMakkiMessage.id !== message.id
    ) {
      try {
        await lastMakkiMessage.delete();

        console.log(
          '[CLEANMAKKI] Previous Makki message deleted ✅'
        );
      } catch (error) {
        console.log(
          '[CLEANMAKKI] Could not delete previous Makki message:',
          error.message || error
        );
      }
    }

    lastMakkiMessage = message;

    scheduleMakkiDeletion(
      message,
      DELETE_DELAY
    );
  }
});

// ======================================================
// DISCORD / PROCESS ERROR LOGGING
// ======================================================

client.on('error', error => {
  console.error('[DISCORD CLIENT ERROR]', error);
});

client.on('warn', warning => {
  console.warn('[DISCORD WARNING]', warning);
});

process.on('unhandledRejection', error => {
  console.error(
    '[UNHANDLED REJECTION]',
    error
  );
});

process.on('uncaughtException', error => {
  console.error(
    '[UNCAUGHT EXCEPTION]',
    error
  );
});

// ======================================================
// START BOT
// ======================================================

async function startBot() {
  try {
    console.log('');
    console.log('======================================');
    console.log('       POLACO GUARDIAN STARTING');
    console.log('======================================');

    // Verifica variáveis
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

    console.log('[STARTUP] Environment variables OK ✅');

    // Inicializa libsodium antes do Discord
    console.log('[STARTUP] Initializing libsodium...');

    await sodium.ready;

    console.log('[STARTUP] libsodium ready ✅');

    // Login
    console.log('[STARTUP] Connecting to Discord...');

    await client.login(TOKEN);

  } catch (error) {
    console.error('');
    console.error('======================================');
    console.error('[STARTUP ERROR]');
    console.error(error);
    console.error('======================================');

    process.exit(1);
  }
}

startBot();
