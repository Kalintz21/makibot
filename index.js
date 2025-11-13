/*
Polaco Guardian — Discord Bot completo
- Slash commands
- Auto-resposta
- CleanMakki persistente
- Status dinâmico
- Express + Heartbeat
- Conexão de voz persistente
*/

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
  setLibsodium
} = require('@discordjs/voice');

require('dotenv').config();
const express = require('express');
const path = require('path');

// ---------- LIBSODIUM SETUP ----------
(async () => {
  try {
    const sodium = require('libsodium-wrappers');
    await sodium.ready;
    setLibsodium(sodium);
    console.log('[VOICE] libsodium-wrappers carregado e configurado ✅');
  } catch (err) {
    console.error('[VOICE] Falha ao carregar libsodium-wrappers:', err);
    try {
      const sodiumNative = require('sodium-native');
      setLibsodium(sodiumNative);
      console.log('[VOICE] sodium-native carregado e configurado ✅');
    } catch (nativeErr) {
      console.error('[VOICE] Nenhuma lib de criptografia compatível encontrada ❌');
    }
  }
})();

// ---------- CLIENT ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ---------- EXPRESS ----------
const app = express();
const port = 3000;
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.listen(port, () => console.log(`[SERVER] HTTP : http://localhost:${port} ✅`));

// ---------- STATUS ----------
const statusMessages = ["Playing Battlefield 6 🔥"];
let currentStatusIndex = 0;

function updateStatus() {
  const currentStatus = statusMessages[currentStatusIndex];
  client.user.setPresence({
    activities: [{ name: currentStatus, type: ActivityType.Playing }],
    status: 'dnd'
  });
  console.log(`[STATUS] Updated status to: ${currentStatus} (dnd)`);
  currentStatusIndex = (currentStatusIndex + 1) % statusMessages.length;
}

// ---------- HEARTBEAT ----------
setInterval(() => {
  console.log(`[HEARTBEAT] Bot is alive at ${new Date().toLocaleTimeString()}`);
}, 30000);

// ---------- SLASH COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('polaco').setDescription('Polaco Guardian está ativo! ✅'),
  new SlashCommandBuilder().setName('dk').setDescription('Mostra informações do servidor'),
  new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Mostra avatar de um usuário')
    .addUserOption(option => option.setName('usuario').setDescription('Usuário para mostrar o avatar')),
  new SlashCommandBuilder()
    .setName('falar')
    .setDescription('Bot repete a mensagem')
    .addStringOption(option => option.setName('mensagem').setDescription('Mensagem a enviar').setRequired(true)),
  new SlashCommandBuilder().setName('guardian').setDescription('Conecta o bot no canal de voz atual'),
  new SlashCommandBuilder().setName('cleanmakki').setDescription('Deleta manualmente a última mensagem do Makki')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

async function registerCommands() {
  try {
    console.log('[SLASH] Registrando comandos...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('[SLASH] Comandos registrados ✅');
  } catch (err) {
    console.error('[SLASH ERROR]', err);
  }
}

// ---------- LOGIN ----------
async function login() {
  try {
    await client.login(process.env.TOKEN);
    console.log(`✅ Logado como: ${client.user.tag}`);
  } catch (err) {
    console.error('❌ Falha ao logar:', err);
    process.exit(1);
  }
}

// ---------- READY ----------
client.once('ready', async () => {
  console.log(`[INFO] Ping: ${client.ws.ping} ms`);
  updateStatus();
  setInterval(updateStatus, 10000);
  registerCommands();

  const channel = client.channels.cache.get('1300277158165614699');
  if (channel) cleanMakkiOnStartup(channel);
});

// ---------- INTERAÇÕES ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === 'polaco') {
    return interaction.reply('Polaco Guardian está ativo! ✅');
  }

  if (commandName === 'dk') {
    const guild = interaction.guild;
    return interaction.reply(`🏰 Servidor: ${guild.name}\n👥 Membros: ${guild.memberCount}`);
  }

  if (commandName === 'avatar') {
    const user = interaction.options.getUser('usuario') || interaction.user;
    return interaction.reply({ content: `${user.tag}`, files: [user.displayAvatarURL({ dynamic: true, size: 1024 })] });
  }

  if (commandName === 'falar') {
    const mensagem = interaction.options.getString('mensagem');
    return interaction.reply(`🗣️ Polaco diz: ${mensagem}`);
  }

  if (commandName === 'guardian') {
    await interaction.deferReply();
    try {
      await connectVoice(interaction.member);
      await interaction.editReply(`✅ Conectado em ${interaction.member.voice.channel.name} e permanecerá na call.`);
    } catch (err) {
      console.error('[GUARDIAN ERROR]', err);
      await interaction.editReply('❌ Não foi possível conectar ao canal de voz.');
    }
  }

  if (commandName === 'cleanmakki') {
    const messages = await interaction.channel.messages.fetch({ limit: 50 });
    const makkiMessage = messages.find(msg => msg.author.bot && isMakkiMessage(msg));
    if (makkiMessage) {
      await makkiMessage.delete().catch(() => {});
      await interaction.reply('🧹 Última mensagem do Makki deletada!');
    } else {
      await interaction.reply('❌ Nenhuma mensagem do Makki encontrada.');
    }
  }
});

// ---------- AUTO-RESPOSTA DEV ----------
const devID = '711382505558638612';
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.mentions.users.has(devID)) {
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('Olá!')
      .setDescription(`Você citou meu dev! Se precisar de ajuda vá em <#1300277158819795013>`)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: `Mensagem enviada automaticamente` });

    const sent = await message.channel.send({ content: `<@${message.author.id}>`, embeds: [embed] });
    setTimeout(() => sent.delete().catch(() => {}), 60000);
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

const DELETE_DELAY = 1 * 60 * 60 * 1000; // 1 hora
let lastMakkiMessage = null;

function scheduleMakkiDeletion(msg, delayMs) {
  const deleteTime = new Date(Date.now() + delayMs);
  console.log(`[CLEANMAKKI] Mensagem agendada para ${deleteTime.toLocaleTimeString()}`);

  setTimeout(() => {
    msg.delete().catch(() => {});
  }, delayMs);
}

// Detecta novas mensagens do Makki
client.on('messageCreate', async message => {
  if (message.author.bot && isMakkiMessage(message)) {
    // Deleta a anterior se existir
    if (lastMakkiMessage && lastMakkiMessage.id !== message.id) {
      lastMakkiMessage.delete().catch(() => {});
      console.log('[CLEANMAKKI] Mensagem anterior do Makki deletada.');
    }
    lastMakkiMessage = message;
    scheduleMakkiDeletion(message, DELETE_DELAY);
  }
});

// Limpa antigas ao iniciar
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

// ---------- VOICE ----------
async function connectVoice(member) {
  if (!member.voice.channel) throw new Error('Você precisa estar em um canal de voz.');

  const connection = joinVoiceChannel({
    channelId: member.voice.channel.id,
    guildId: member.guild.id,
    adapterCreator: member.guild.voiceAdapterCreator,
    selfDeaf: false
  });

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play }
  });

  const playSilence = () => {
    const resource = createAudioResource(path.join(__dirname, 'silence.mp3'));
    player.play(resource);
  };

  player.on(AudioPlayerStatus.Idle, playSilence);
  connection.subscribe(player);
  playSilence();

  console.log(`[VOICE] Conectado em ${member.voice.channel.name} e tocando silêncio contínuo.`);
}

// ---------- START ----------
login();
