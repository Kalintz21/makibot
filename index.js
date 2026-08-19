/*
=========================================================
               POLACO GUARDIAN - FINAL
=========================================================

Comandos:
  /guardian
  /leave
  /polaco
  /ping
  /dk
  /avatar
  /userinfo
  /falar
  /say
  /cleanmakki

Voice:
  /guardian conecta ao canal do usuário
  Toca silence.mp3 / silence.wav continuamente

CleanMakki:
  Detecta SOMENTE o Makki pelo ID
  Canal específico
  Remove mensagem automática após 2 horas
  /cleanmakki permite remoção manual

=========================================================
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
  SlashCommandBuilder,
  MessageFlags
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

// Makki
const MAKKI_ID = '563434444321587202';
const MAKKI_CHANNEL = '1300277158165614699';

// 2 horas
const DELETE_DELAY = 2 * 60 * 60 * 1000;

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
// DISCORD / SHARD LOGS
// ======================================================

client.on('warn', warning => {
  console.warn('[DISCORD WARNING]', warning);
});

client.on('error', error => {
  console.error('[DISCORD ERROR]', error);
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
    `[SHARD DISCONNECT] Reason: ${
      event.reason || 'sem motivo'
    }`
  );
});

client.on('shardReconnecting', shardId => {
  console.warn(
    `[SHARD] Reconnecting shard ${shardId}...`
  );
});

client.on('shardResume', (shardId, replayedEvents) => {
  console.log(
    `[SHARD] Shard ${shardId} resumed | ${replayedEvents} replayed event(s) ✅`
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
    ping: client.ws.ping,
    uptime: Math.floor(process.uptime())
  });
});

const server = app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `[SERVER] Listening on port ${PORT} ✅`
    );
  }
);

// ======================================================
// SLASH COMMANDS
// ======================================================

const commands = [

  new SlashCommandBuilder()
    .setName('guardian')
    .setDescription(
      'Conecta o Polaco Guardian ao seu canal de voz'
    ),

  new SlashCommandBuilder()
    .setName('leave')
    .setDescription(
      'Desconecta o Polaco Guardian do canal de voz'
    ),

  new SlashCommandBuilder()
    .setName('polaco')
    .setDescription(
      'Verifica se o Polaco Guardian está ativo'
    ),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription(
      'Mostra a latência do Polaco Guardian'
    ),

  new SlashCommandBuilder()
    .setName('dk')
    .setDescription(
      'Mostra informações do servidor'
    ),

  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription(
      'Mostra o avatar de um usuário'
    )
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription(
          'Usuário que deseja visualizar'
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription(
      'Mostra informações de um usuário'
    )
    .addUserOption(option =>
      option
        .setName('usuario')
        .setDescription(
          'Usuário que deseja consultar'
        )
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('falar')
    .setDescription(
      'Faz o Polaco Guardian enviar uma mensagem'
    )
    .addStringOption(option =>
      option
        .setName('texto')
        .setDescription(
          'Texto que o bot deverá enviar'
        )
        .setRequired(true)
    ),

  // Alias do /falar
  new SlashCommandBuilder()
    .setName('say')
    .setDescription(
      'Faz o Polaco Guardian enviar uma mensagem'
    )
    .addStringOption(option =>
      option
        .setName('texto')
        .setDescription(
          'Texto que o bot deverá enviar'
        )
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('cleanmakki')
    .setDescription(
      'Remove manualmente a última mensagem automática do Makki'
    )

].map(command => command.toJSON());

// ======================================================
// REGISTER COMMANDS
// ======================================================

async function registerCommands() {

  try {

    console.log(
      `[SLASH] Registering ${commands.length} commands...`
    );

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
      `[SLASH] ${commands.length} commands registered ✅`
    );

  } catch (error) {

    console.error(
      '[SLASH ERROR]',
      error
    );
  }
}

// ======================================================
// SILENCE FILE
// ======================================================

function getSilentAudioPath() {

  const mp3 =
    path.join(__dirname, 'silence.mp3');

  const wav =
    path.join(__dirname, 'silence.wav');

  if (fs.existsSync(mp3)) {
    return mp3;
  }

  if (fs.existsSync(wav)) {
    return wav;
  }

  throw new Error(
    'silence.mp3 ou silence.wav não encontrado no projeto.'
  );
}

// ======================================================
// VOICE
// ======================================================

async function connectVoice(member) {

  const channel =
    member.voice?.channel;

  if (!channel) {
    throw new Error(
      'Você precisa estar em um canal de voz.'
    );
  }

  console.log('');
  console.log(
    `[VOICE] Requested channel: ${channel.name}`
  );

  console.log(
    `[VOICE] Channel ID: ${channel.id}`
  );

  console.log(
    `[VOICE] Guild: ${channel.guild.name}`
  );

  // --------------------------------------
  // Destroy old connection
  // --------------------------------------

  const oldConnection =
    getVoiceConnection(channel.guild.id);

  if (oldConnection) {

    console.log(
      '[VOICE] Destroying previous connection...'
    );

    try {
      oldConnection.destroy();
    } catch {}

    // Pequena pausa
    await new Promise(
      resolve => setTimeout(resolve, 500)
    );
  }

  // --------------------------------------
  // Join
  // --------------------------------------

  console.log(
    '[VOICE] Creating voice connection...'
  );

  const connection =
    joinVoiceChannel({

      channelId: channel.id,

      guildId: channel.guild.id,

      adapterCreator:
        channel.guild.voiceAdapterCreator,

      selfDeaf: false,

      selfMute: false
    });

  // --------------------------------------
  // Logs
  // --------------------------------------

  connection.on(
    'stateChange',
    (oldState, newState) => {

      console.log(
        `[VOICE STATE] ${oldState.status} -> ${newState.status}`
      );
    }
  );

  connection.on(
    'error',
    error => {

      console.error(
        '[VOICE CONNECTION ERROR]',
        error
      );
    }
  );

  // --------------------------------------
  // Wait Ready
  // --------------------------------------

  console.log(
    '[VOICE] Waiting for Ready state...'
  );

  try {

    await entersState(
      connection,
      VoiceConnectionStatus.Ready,
      30_000
    );

  } catch (error) {

    console.error(
      '[VOICE] Could not reach Ready state:',
      error
    );

    try {
      connection.destroy();
    } catch {}

    throw new Error(
      'A conexão de voz não ficou pronta em 30 segundos.'
    );
  }

  console.log(
    '[VOICE] Connection Ready ✅'
  );

  // --------------------------------------
  // Player
  // --------------------------------------

  const player =
    createAudioPlayer({

      behaviors: {

        noSubscriber:
          NoSubscriberBehavior.Play
      }
    });

  player.on(
    'error',
    error => {

      console.error(
        '[AUDIO ERROR]',
        error
      );
    }
  );

  player.on(
    AudioPlayerStatus.Playing,
    () => {

      console.log(
        '[VOICE] Silent audio playing ✅'
      );
    }
  );

  function playSilence() {

    try {

      const silenceFile =
        getSilentAudioPath();

      const resource =
        createAudioResource(
          silenceFile
        );

      player.play(resource);

    } catch (error) {

      console.error(
        '[VOICE AUDIO ERROR]',
        error.message || error
      );
    }
  }

  // --------------------------------------
  // Infinite silence loop
  // --------------------------------------

  player.on(
    AudioPlayerStatus.Idle,
    () => {

      setTimeout(
        playSilence,
        500
      );
    }
  );

  connection.subscribe(player);

  playSilence();

  console.log(
    `[VOICE] Connected to ${channel.name} ✅`
  );

  return connection;
}

// ======================================================
// CLEAN MAKKI
// ======================================================

let lastMakkiMessage = null;

const makkiTimers = new Map();

// ======================================================
// MESSAGE TEXT / EMBEDS
// ======================================================

function getMakkiMessageText(message) {

  let text =
    message.content || '';

  for (const embed of message.embeds) {

    if (embed.title) {
      text += ` ${embed.title}`;
    }

    if (embed.description) {
      text += ` ${embed.description}`;
    }

    if (embed.fields?.length) {

      for (const field of embed.fields) {

        text +=
          ` ${field.name || ''} ${
            field.value || ''
          }`;
      }
    }

    if (embed.footer?.text) {
      text +=
        ` ${embed.footer.text}`;
    }
  }

  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    );
}

// ======================================================
// IDENTIFY MAKKI AUTOMATIC MESSAGE
// ======================================================

function isMakkiMessage(message) {

  if (!message) {
    return false;
  }

  // ID EXATO DO MAKKI
  if (
    message.author?.id !==
    MAKKI_ID
  ) {
    return false;
  }

  // Canal exato
  if (
    message.channel?.id !==
    MAKKI_CHANNEL
  ) {
    return false;
  }

  const text =
    getMakkiMessageText(message);

  if (!text.trim()) {
    return false;
  }

  /*
  A mensagem automática histórica contém
  características como:

  "Vocês gostam da nossa comunidade"
  "convide seus amigos"
  "TAG DK"

  Basta encontrar UMA característica forte,
  pois o autor já foi confirmado pelo ID.
  */

  const patterns = [
    'voces gostam da nossa comunidade',
    'convide seus amigos',
    "tag 'dk'",
    'tag "dk"',
    'tag “dk”',
    'tag dk'
  ];

  return patterns.some(
    pattern =>
      text.includes(pattern)
  );
}

// ======================================================
// DELETE MAKKI
// ======================================================

async function deleteMakkiMessage(
  message,
  reason = 'timer'
) {

  if (!message) {
    return false;
  }

  // Segurança extra
  if (
    message.author?.id !== MAKKI_ID
  ) {

    console.log(
      '[CLEANMAKKI] Delete cancelled: author is not Makki.'
    );

    return false;
  }

  try {

    await message.delete();

    console.log(
      `[CLEANMAKKI] Message deleted ✅ | ${message.id} | Reason: ${reason}`
    );

    const timer =
      makkiTimers.get(message.id);

    if (timer) {

      clearTimeout(timer);

      makkiTimers.delete(
        message.id
      );
    }

    if (
      lastMakkiMessage?.id ===
      message.id
    ) {

      lastMakkiMessage = null;
    }

    return true;

  } catch (error) {

    // Discord: Unknown Message
    if (error?.code === 10008) {

      console.log(
        `[CLEANMAKKI] Message ${message.id} already deleted.`
      );

      makkiTimers.delete(
        message.id
      );

      return true;
    }

    console.error(
      `[CLEANMAKKI] Failed deleting ${message.id}:`,
      error.message || error
    );

    return false;
  }
}

// ======================================================
// SCHEDULE MAKKI DELETE
// ======================================================

function scheduleMakkiDeletion(
  message,
  delay
) {

  // Evita timer duplicado
  if (
    makkiTimers.has(message.id)
  ) {
    return;
  }

  const deleteAt =
    Date.now() + delay;

  const deleteDate =
    new Date(deleteAt);

  console.log(
    `[CLEANMAKKI] Scheduled ✅ | ID: ${message.id}`
  );

  console.log(
    `[CLEANMAKKI] Delete at: ${deleteDate.toLocaleString(
      'pt-BR',
      {
        timeZone:
          'America/Sao_Paulo'
      }
    )}`
  );

  const timer =
    setTimeout(
      async () => {

        makkiTimers.delete(
          message.id
        );

        await deleteMakkiMessage(
          message,
          '2 hour timer'
        );

      },
      delay
    );

  makkiTimers.set(
    message.id,
    timer
  );
}

// ======================================================
// CLEAN MAKKI STARTUP
// ======================================================

async function cleanMakkiOnStartup(
  channel
) {

  console.log('');
  console.log(
    '[CLEANMAKKI] Startup scan...'
  );

  try {

    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const matching =
      messages
        .filter(isMakkiMessage)
        .sort(
          (a, b) =>
            b.createdTimestamp -
            a.createdTimestamp
        );

    console.log(
      `[CLEANMAKKI] Found ${matching.size} matching Makki message(s).`
    );

    let newest = null;

    for (
      const message
      of matching.values()
    ) {

      if (!newest) {
        newest = message;
      }

      const age =
        Date.now() -
        message.createdTimestamp;

      const remaining =
        Math.max(
          DELETE_DELAY - age,
          0
        );

      console.log(
        `[CLEANMAKKI] Message ${message.id} | Age: ${Math.floor(
          age / 60000
        )} minute(s)`
      );

      if (
        remaining <= 0
      ) {

        await deleteMakkiMessage(
          message,
          'startup expired timer'
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

    console.log(
      '[CLEANMAKKI] Startup scan finished ✅'
    );

  } catch (error) {

    console.error(
      '[CLEANMAKKI STARTUP ERROR]',
      error
    );
  }
}

// ======================================================
// MANUAL CLEAN MAKKI
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

      throw new Error(
        'Canal do Makki não encontrado.'
      );
    }

    const messages =
      await channel.messages.fetch({
        limit: 100
      });

    const matching =
      messages
        .filter(isMakkiMessage)
        .sort(
          (a, b) =>
            b.createdTimestamp -
            a.createdTimestamp
        );

    const latest =
      matching.first();

    if (!latest) {

      return {
        deleted: false,
        reason:
          'Nenhuma mensagem automática do Makki encontrada.'
      };
    }

    const deleted =
      await deleteMakkiMessage(
        latest,
        'manual /cleanmakki'
      );

    return {
      deleted,
      messageId:
        latest.id
    };

  } catch (error) {

    console.error(
      '[CLEANMAKKI MANUAL ERROR]',
      error
    );

    return {
      deleted: false,
      reason:
        error.message || String(error)
    };
  }
}

// ======================================================
// READY
// ======================================================

client.once(
  'ready',
  async readyClient => {

    console.log('');
    console.log(
      '======================================'
    );

    console.log(
      `[BOT] Logged in as ${readyClient.user.tag} ✅`
    );

    console.log(
      `[BOT] Bot ID: ${readyClient.user.id}`
    );

    console.log(
      `[BOT] Guilds: ${readyClient.guilds.cache.size}`
    );

    console.log(
      `[BOT] Gateway ping: ${readyClient.ws.ping}ms`
    );

    console.log(
      '======================================'
    );
    console.log('');

    // ------------------------------------
    // Commands
    // ------------------------------------

    await registerCommands();

    // ------------------------------------
    // Presence
    // ------------------------------------

    try {

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

      console.log(
        '[BOT] Presence configured ✅'
      );

    } catch (error) {

      console.error(
        '[PRESENCE ERROR]',
        error
      );
    }

    // ------------------------------------
    // Makki channel
    // ------------------------------------

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
          '[CLEANMAKKI] Makki channel is not text-based.'
        );
      }

    } catch (error) {

      console.error(
        '[CLEANMAKKI] Could not fetch channel:',
        error.message || error
      );
    }
  }
);

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

    console.log(
      `[COMMAND] /${command} | User: ${interaction.user.tag}`
    );

    try {

      // ==================================================
      // /guardian
      // ==================================================

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
            '✅ Polaco Guardian conectado ao seu canal de voz.'
          );

        } catch (error) {

          console.error(
            '[GUARDIAN ERROR]',
            error
          );

          await interaction.editReply(
            `❌ Falha ao conectar ao canal de voz:\n\`${error.message || error}\``
          );
        }

        return;
      }

      // ==================================================
      // /leave
      // ==================================================

      if (
        command === 'leave'
      ) {

        const connection =
          getVoiceConnection(
            interaction.guild.id
          );

        if (
          !connection
        ) {

          await interaction.reply({
            content:
              '❌ Não estou conectado a nenhum canal de voz.',

            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        connection.destroy();

        console.log(
          '[VOICE] Connection destroyed manually.'
        );

        await interaction.reply({
          content:
            '👋 Desconectado do canal de voz.',

          flags:
            MessageFlags.Ephemeral
        });

        return;
      }

      // ==================================================
      // /polaco
      // ==================================================

      if (
        command === 'polaco'
      ) {

        await interaction.reply(
          'Polaco Guardian está ativo! ✅'
        );

        return;
      }

      // ==================================================
      // /ping
      // ==================================================

      if (
        command === 'ping'
      ) {

        const start =
          Date.now();

        await interaction.reply(
          '🏓 Pong!'
        );

        const interactionPing =
          Date.now() - start;

        const gatewayPing =
          Math.round(
            client.ws.ping
          );

        await interaction.editReply(
          `🏓 **Pong!**\n` +
          `🤖 Bot: **${interactionPing}ms**\n` +
          `🌐 Discord Gateway: **${gatewayPing}ms**`
        );

        return;
      }

      // ==================================================
      // /dk
      // ==================================================

      if (
        command === 'dk'
      ) {

        const guild =
          interaction.guild;

        if (!guild) {

          await interaction.reply({
            content:
              '❌ Esse comando precisa ser usado dentro de um servidor.',

            flags:
              MessageFlags.Ephemeral
          });

          return;
        }

        await interaction.reply(
          `🏰 **${guild.name}**\n` +
          `👥 Membros: **${guild.memberCount}**\n` +
          `🆔 Servidor: \`${guild.id}\`\n` +
          `👑 Dono: <@${guild.ownerId}>`
        );

        return;
      }

      // ==================================================
      // /avatar
      // ==================================================

      if (
        command === 'avatar'
      ) {

        const user =
          interaction.options.getUser(
            'usuario'
          ) ||
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

      // ==================================================
      // /userinfo
      // ==================================================

      if (
        command === 'userinfo'
      ) {

        const user =
          interaction.options.getUser(
            'usuario'
          ) ||
          interaction.user;

        let member = null;

        try {

          member =
            await interaction.guild.members.fetch(
              user.id
            );

        } catch {}

        const created =
          Math.floor(
            user.createdTimestamp / 1000
          );

        const joined =
          member?.joinedTimestamp
            ? Math.floor(
                member.joinedTimestamp /
                  1000
              )
            : null;

        let response =
          `👤 **Informações de ${user.username}**\n` +
          `🆔 ID: \`${user.id}\`\n` +
          `🤖 Bot: **${user.bot ? 'Sim' : 'Não'}**\n` +
          `📅 Conta criada: <t:${created}:F>`;

        if (joined) {

          response +=
            `\n📥 Entrou no servidor: <t:${joined}:F>`;
        }

        await interaction.reply(
          response
        );

        return;
      }

      // ==================================================
      // /falar
      // /say
      // ==================================================

      if (
        command === 'falar' ||
        command === 'say'
      ) {

        const text =
          interaction.options.getString(
            'texto',
            true
          );

        await interaction.reply({
          content:
            '✅ Mensagem enviada.',

          flags:
            MessageFlags.Ephemeral
        });

        await interaction.channel.send(
          text
        );

        return;
      }

      // ==================================================
      // /cleanmakki
      // ==================================================

      if (
        command === 'cleanmakki'
      ) {

        await interaction.deferReply({
          flags:
            MessageFlags.Ephemeral
        });

        const result =
          await manualCleanMakki();

        if (
          result.deleted
        ) {

          await interaction.editReply(
            `✅ Última mensagem automática do Makki removida.\nID: \`${result.messageId}\``
          );

        } else {

          await interaction.editReply(
            `ℹ️ ${result.reason || 'Nenhuma mensagem foi removida.'}`
          );
        }

        return;
      }

      // ==================================================
      // UNKNOWN
      // ==================================================

      console.warn(
        `[COMMAND] Unknown command: /${command}`
      );

    } catch (error) {

      console.error(
        `[COMMAND ERROR] /${command}`,
        error
      );

      const text =
        `❌ Ocorreu um erro ao executar **/${command}**.\n\`${error.message || error}\``;

      if (
        interaction.deferred ||
        interaction.replied
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
// MESSAGE CREATE / CLEAN MAKKI
// ======================================================

client.on(
  'messageCreate',
  async message => {

    // Só nos interessa o canal do Makki
    if (
      message.channel.id !==
      MAKKI_CHANNEL
    ) {
      return;
    }

    // Log somente das mensagens do Makki
    if (
      message.author.id ===
      MAKKI_ID
    ) {

      console.log('');
      console.log(
        `[CLEANMAKKI] Makki message received | ID: ${message.id}`
      );

      console.log(
        `[CLEANMAKKI] Content length: ${
          message.content?.length || 0
        }`
      );

      console.log(
        `[CLEANMAKKI] Embeds: ${message.embeds.length}`
      );
    }

    if (
      !isMakkiMessage(message)
    ) {

      if (
        message.author.id ===
        MAKKI_ID
      ) {

        console.log(
          '[CLEANMAKKI] Makki message ignored: not the automatic target message.'
        );
      }

      return;
    }

    console.log(
      '[CLEANMAKKI] Automatic Makki message detected ✅'
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
// DISCORD REST PREFLIGHT
// ======================================================

async function discordPreflight() {

  console.log(
    '[STARTUP] Testing Discord REST API...'
  );

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
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

    console.log(
      `[STARTUP] Discord REST HTTP ${response.status}`
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
          'Discord/Cloudflare bloqueou temporariamente o IP de saída do Render (HTTP 429 / Error 1015).'
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
        'TOKEN inválido ou expirado (HTTP 401).'
      );
    }

    if (!response.ok) {

      throw new Error(
        `Discord REST retornou HTTP ${response.status}.`
      );
    }

    const bot =
      await response.json();

    console.log(
      `[STARTUP] Authenticated as ${bot.username} (${bot.id}) ✅`
    );

    if (
      String(bot.id) !==
      String(CLIENT_ID)
    ) {

      throw new Error(
        `CLIENT_ID não pertence ao TOKEN informado. Token ID=${bot.id}, CLIENT_ID=${CLIENT_ID}`
      );
    }

    console.log(
      '[STARTUP] TOKEN + CLIENT_ID OK ✅'
    );

  } finally {

    clearTimeout(timer);
  }
}

// ======================================================
// PROCESS ERRORS
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
    `[SYSTEM] ${signal} received.`
  );

  for (
    const timer
    of makkiTimers.values()
  ) {

    clearTimeout(timer);
  }

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
// START
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

    // ------------------------------------
    // ENV
    // ------------------------------------

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

    console.log(
      '[STARTUP] Environment variables OK ✅'
    );

    console.log(
      `[STARTUP] CLIENT_ID: ${CLIENT_ID}`
    );

    console.log(
      `[STARTUP] GUILD_ID: ${GUILD_ID}`
    );

    // ------------------------------------
    // Sodium
    // ------------------------------------

    console.log(
      '[STARTUP] Initializing libsodium...'
    );

    await sodium.ready;

    console.log(
      '[STARTUP] libsodium ready ✅'
    );

    // ------------------------------------
    // Discord REST preflight
    // ------------------------------------

    await discordPreflight();

    // ------------------------------------
    // Gateway
    // ------------------------------------

    console.log(
      '[STARTUP] Connecting to Discord Gateway...'
    );

    const LOGIN_TIMEOUT =
      45_000;

    let timeout;

    const timeoutPromise =
      new Promise(
        (_, reject) => {

          timeout =
            setTimeout(
              () => {

                reject(
                  new Error(
                    `Discord Gateway login timeout after ${
                      LOGIN_TIMEOUT /
                      1000
                    } seconds.`
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

    clearTimeout(timeout);

    console.log(
      '[STARTUP] Discord login completed ✅'
    );

  } catch (error) {

    console.error('');
    console.error(
      '======================================'
    );

    console.error(
      '[STARTUP ERROR]'
    );

    console.error(
      error.message || error
    );

    console.error(
      '======================================'
    );

    try {
      client.destroy();
    } catch {}

    setTimeout(
      () => process.exit(1),
      3000
    );
  }
}

startBot();
