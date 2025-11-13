/*
Bot Node.js completo com Slash Commands, auto-resposta e CleanMakki persistente
Mantém status + heartbeat + Express + logs detalhados
*/

const { Client, GatewayIntentBits, ActivityType, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers'); // Necessário para áudio
require('dotenv').config();
const express = require('express');
const path = require('path');

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ---------- EXPRESS SERVER ----------
const app = express();
const port = 3000;
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.listen(port, () => console.log(`[SERVER] SH : http://localhost:${port} ✅`));

// ---------- STATUS ----------
const statusMessages = ["Playing Battlefield 6 🔥"];
const statusTypes = ['dnd'];
let currentStatusIndex = 0;
let currentTypeIndex = 0;

function updateStatus() {
  const currentStatus = statusMessages[currentStatusIndex];
  const currentType = statusTypes[currentTypeIndex];
  client.user.setPresence({
    activities: [{ name: currentStatus, type: ActivityType.Custom }],
    status: currentType,
  });
  console.log(`[STATUS] Updated status to: ${currentStatus} (${currentType})`);
  currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
  currentTypeIndex = (currentTypeIndex + 1) % statusTypes.length;
}

// ---------- HEARTBEAT ----------
function heartbeat() {
  setInterval(() => {
    console.log(`[HEARTBEAT] Bot is alive at ${new Date().toLocaleTimeString()}`);
  }, 30000);
}

// ---------- SLASH COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('polaco').setDescription('Polaco Guardian está ativo! ✅'),
  new SlashCommandBuilder().setName('dk').setDescription('Mostra informações do servidor'),
  new SlashCommandBuilder().setName('avatar').setDescription('Mostra avatar de um usuário')
    .addUserOption(option => option.setName('usuario').setDescription('Usuário para mostrar o avatar')),
  new SlashCommandBuilder().setName('falar').setDescription('Bot repete a mensagem')
    .addStringOption(option => option.setName('mensagem').setDescription('Mensagem a enviar').setRequired(true)),
  new SlashCommandBuilder().setName('guardian').setDescription('Conecta o bot em um canal de voz'),
  new SlashCommandBuilder().setName('cleanmakki').setDescription('Deleta a última mensagem do Makki imediatamente (teste)'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('[SLASH] Registrando comandos no servidor...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('[SLASH] Comandos registrados ✅');
  } catch (error) {
    console.error('[SLASH ERROR]', error);
  }
}

// ---------- LOGIN ----------
async function login() {
  try {
    await client.login(process.env.TOKEN);
    console.log(`Logged in as: ${client.user.tag} ✅`);
    console.log(`Bot ID: ${client.user.id}`);
    console.log(`Connected to ${client.guilds.cache.size} server(s)`);
  } catch (error) {
    console.error('Failed to log in:', error);
    process.exit(1);
  }
}

// ---------- READY ----------
client.once('ready', async () => {
  console.log(`[INFO] Ping: ${client.ws.ping} ms`);
  updateStatus();
  setInterval(updateStatus, 10000);
  heartbeat();
  registerCommands();

  await sodium.ready;
  console.log('[INFO] libsodium-wrappers carregado e pronto para uso');

  // Detecta mensagens antigas do Makki ao iniciar
  const channel = client.channels.cache.get('1300277158165614699'); // Canal do Makki
  if (channel) cleanMakkiOnStartup(channel);
});

// ---------- INTERAÇÕES DE SLASH ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'polaco') {
    await interaction.reply('Polaco Guardian está ativo! ✅');
  } else if (commandName === 'dk') {
    const guild = interaction.guild;
    await interaction.reply(`🏰 Servidor: ${guild.name}\nID: ${guild.id}\nMembros: ${guild.memberCount}\nCriado em: ${guild.createdAt.toLocaleDateString()}`);
  } else if (commandName === 'avatar') {
    const user = interaction.options.getUser('usuario') || interaction.user;
    await interaction.reply({ content: `${user.tag}`, files: [user.displayAvatarURL({ dynamic: true, size: 1024 })] });
  } else if (commandName === 'falar') {
    const mensagem = interaction.options.getString('mensagem');
    await interaction.reply(`🗣️ Polaco diz: ${mensagem}`);
  } else if (commandName === 'guardian') {
    try {
      await interaction.deferReply();
      await connectVoice(interaction.member);
      await interaction.editReply(`✅ Conectado ao canal de voz: ${interaction.member.voice.channel.name} (permanecerá conectado)`);
    } catch (err) {
      console.error('[GUARDIAN ERROR]', err);
      await interaction.followUp('❌ Não foi possível conectar ao canal de voz.');
    }
  } else if (commandName === 'cleanmakki') {
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const makkiMessage = messages.find(msg => msg.author.bot && isMakkiMessage(msg));

    if (makkiMessage) {
      await makkiMessage.delete().catch(() => {});
      await interaction.reply('🧹 Última mensagem do Makki deletada com sucesso!');
    } else {
      await interaction.reply('❌ Nenhuma mensagem do Makki encontrada nas últimas 50 mensagens.');
    }
  }
});

// ---------- AUTO-RESPOSTA PARA MENÇÃO DO DEV ----------
const devID = '711382505558638612';
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  if (message.mentions.users.has(devID)) {
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Olá!')
      .setDescription(`Olá, vejo que você citou o nome do meu desenvolvedor, se precisar de ajuda vá ao canal de <#1300277158819795013>`)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Mensagem enviada automaticamente` });

    const sentMsg = await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });
    setTimeout(() => sentMsg.delete().catch(() => {}), 60 * 1000); // 1 minuto
  }
});

// ---------- CLEANMAKKI ----------
const makkiPatterns = [
  'Vocês gostam da nossa comunidade',
  'DK',
  'convide seus amigos'
];

function isMakkiMessage(msg) {
  return makkiPatterns.every(p => msg.content.includes(p));
}

// 🔹 APAGA MENSAGENS DO MAKKI 1 HORA DEPOIS
const DELETE_DELAY = 1 * 60 * 60 * 1000; // 1 hora

function scheduleMakkiDeletion(msg, delayMs) {
  const deleteTime = new Date(Date.now() + delayMs);
  console.log(`[CLEANMAKKI] Mensagem do Makki agendada para deletar em ${deleteTime.toLocaleTimeString()}`);
  console.log(`[CLEANMAKKI] Conteúdo: "${msg.content.slice(0, 50)}..."`);

  setTimeout(() => {
    msg.delete()
      .then(() => console.log(`[CLEANMAKKI] Mensagem deletada: "${msg.content.slice(0, 50)}..."`))
      .catch(() => console.log('[CLEANMAKKI] Não foi possível deletar a mensagem.'));
  }, delayMs);
}

// Mensagens novas
client.on('messageCreate', async message => {
  if (message.author.bot && isMakkiMessage(message)) {
    scheduleMakkiDeletion(message, DELETE_DELAY);
  }
});

// Mensagens antigas ao iniciar
async function cleanMakkiOnStartup(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  messages.forEach(msg => {
    if (msg.author.bot && isMakkiMessage(msg)) {
      const now = Date.now();
      const diff = now - msg.createdTimestamp;
      const delay = Math.max(DELETE_DELAY - diff, 0);
      scheduleMakkiDeletion(msg, delay);
    }
  });
}

// ---------- VOICE CONNECTION ----------
async function connectVoice(member) {
  if (!member.voice.channel) throw new Error('O usuário não está em nenhum canal de voz');

  const connection = joinVoiceChannel({
    channelId: member.voice.channel.id,
    guildId: member.guild.id,
    adapterCreator: member.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });

  function playSilence() {
    const resource = createAudioResource(path.join(__dirname, 'silence.mp3'));
    player.play(resource);
  }

  player.on(AudioPlayerStatus.Idle, () => {
    playSilence(); // Loop contínuo de áudio silencioso
  });

  connection.subscribe(player);
  playSilence();

  console.log(`[VOICE] Bot conectado em ${member.voice.channel.name} e permanecerá conectado.`);
}

// ---------- LOGIN ----------
login();
