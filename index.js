/*
Polaco Guardian Final - agora com CleanMakki
Commands: /guardian, /leave, /polaco, /dk
Voz: /guardian conecta e toca silêncio contínuo
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
  EmbedBuilder
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
  setPreferredEncryptionMode,
  entersState,
  VoiceConnectionStatus
} = require('@discordjs/voice');

try {
  setPreferredEncryptionMode('aead_xchacha20_poly1305_rtpsize');
  console.log('[VOICE] Preferred encryption mode set');
} catch (e) {
  console.warn('[VOICE] Could not set preferred encryption mode:', e.message || e);
}

const sodium = require('libsodium-wrappers');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const MAKKI_CHANNEL = '1300277158165614699'; // canal do Makki
const PORT = process.env.PORT || 10000;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Express keepalive
const app = express();
app.get('/', (req, res) => res.send('Polaco Guardian is alive ✅'));
app.listen(PORT, () => console.log(`[SERVER] Listening on port ${PORT}`));

// ---------- Slash Commands ----------
const commands = [
  new SlashCommandBuilder().setName('guardian').setDescription('Conecta o bot no seu canal de voz'),
  new SlashCommandBuilder().setName('leave').setDescription('Desconecta o bot do canal de voz'),
  new SlashCommandBuilder().setName('polaco').setDescription('Polaco Guardian está ativo! ✅'),
  new SlashCommandBuilder().setName('dk').setDescription('Mostra informações do servidor')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log('[SLASH] Registering commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('[SLASH] Commands registered ✅');
  } catch (err) {
    console.error('[SLASH ERROR]', err);
  }
}

// ---------- Helpers ----------
function getSilentAudioPath() {
  const mp3 = path.join(__dirname, 'silence.mp3');
  const wav = path.join(__dirname, 'silence.wav');
  if (fs.existsSync(mp3)) return mp3;
  if (fs.existsSync(wav)) return wav;
  throw new Error('No silence audio file found');
}

async function connectVoice(member) {
  const channel = member.voice?.channel;
  if (!channel) throw new Error('Você não está em um canal de voz');

  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    console.log('[VOICE] Connection ready');
  } catch (e) {
    console.warn('[VOICE] Connection did not reach Ready in time:', e.message || e);
  }

  const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });

  function playLoop() {
    const resource = createAudioResource(getSilentAudioPath());
    player.play(resource);
  }

  player.on(AudioPlayerStatus.Idle, () => setTimeout(playLoop, 250));
  connection.subscribe(player);
  playLoop();

  console.log(`[VOICE] Connected and playing in ${channel.name}`);
  return connection;
}

// ---------- CleanMakki ----------
const DELETE_DELAY = 1 * 60 * 60 * 1000; // 1h
const MAKKI_PATTERNS = ['Vocês gostam da nossa comunidade','DK','convide seus amigos'];

function isMakkiMessage(msg) {
  return MAKKI_PATTERNS.every(p => msg.content.includes(p));
}

function scheduleMakkiDeletion(msg, delayMs) {
  const deleteTime = new Date(Date.now() + delayMs);
  console.log(`[CLEANMAKKI] Scheduled deletion at ${deleteTime.toLocaleTimeString()} | "${msg.content.slice(0,50)}..."`);
  setTimeout(() => {
    msg.delete().catch(() => console.log('[CLEANMAKKI] Could not delete message'));
  }, delayMs);
}

async function cleanMakkiOnStartup(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  messages.forEach(msg => {
    if (msg.author.bot && isMakkiMessage(msg)) {
      const diff = Date.now() - msg.createdTimestamp;
      const delay = Math.max(DELETE_DELAY - diff, 0);
      scheduleMakkiDeletion(msg, delay);
    }
  });
}

// ---------- Event Handlers ----------
client.once('ready', async () => {
  console.log('[BOT] Logged in as', client.user.tag);
  await sodium.ready;
  console.log('[INFO] libsodium ready');

  registerCommands();
  client.user.setPresence({ activities: [{ name:'Playing Battlefield 6 🔥', type: ActivityType.Playing }], status: 'dnd' });

  // CleanMakki startup
  const channel = client.channels.cache.get(MAKKI_CHANNEL);
  if (channel) cleanMakkiOnStartup(channel);
});

// Slash commands
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  if (cmd === 'guardian') {
    await interaction.deferReply({ ephemeral:true }).catch(()=>{});
    try {
      await connectVoice(interaction.member);
      await interaction.editReply('✅ Conectado ao canal de voz e tocando silêncio em loop.');
    } catch (e) {
      console.error('[GUARDIAN ERROR]', e);
      await interaction.editReply('❌ Falha ao conectar: ' + (e.message || e));
    }
  } else if (cmd === 'leave') {
    const conn = getVoiceConnection(interaction.guild.id);
    if (conn) {
      conn.destroy();
      await interaction.reply('👋 Desconectado.');
    } else {
      await interaction.reply('❌ Não estou conectado a nenhum canal.');
    }
  } else if (cmd === 'polaco') {
    await interaction.reply('Polaco Guardian está ativo! ✅');
  } else if (cmd === 'dk') {
    const g = interaction.guild;
    await interaction.reply(`Servidor: ${g.name} | ID: ${g.id} | Membros: ${g.memberCount}`);
  }
});

// Detecta mensagens do Makki novas e agenda deleção
client.on('messageCreate', async message => {
  if (message.author.bot && isMakkiMessage(message)) {
    scheduleMakkiDeletion(message, DELETE_DELAY);
  }
});

client.login(TOKEN);
