const { 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  ChannelType 
} = require('discord.js');
const { 
  joinVoiceChannel, 
  createAudioPlayer, 
  createAudioResource, 
  AudioPlayerStatus 
} = require('@discordjs/voice');
const { spawn, execFile } = require('child_process');
const path = require('path');
const { getTracks } = require('spotify-url-info')(fetch);
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

const YT_DLP_PATH = path.join(__dirname, '../../bin/yt-dlp');

// In-memory store for active music subscriptions per guild
// guildId -> { voiceConnection, audioPlayer, queue: [], currentTrack: null, textChannel: channel, currentProc: child_process, isPaused: false }
const subscriptions = new Map();

// Helper: Get active music subscription
function getSubscription(guildId) {
  return subscriptions.get(guildId);
}

// Helper: Resolve query to array of track objects
async function resolveTracks(query, requester) {
  const tracks = [];

  // A. Spotify URLs (Tracks, Albums, Playlists)
  if (query.includes('spotify.com')) {
    try {
      const spTracks = await getTracks(query);
      for (const t of spTracks) {
        tracks.push({
          title: `${t.name} - ${t.artist}`,
          searchTarget: `ytsearch:${t.name} ${t.artist}`,
          url: null,
          duration: 'Unknown',
          thumbnail: t.coverArt?.sources[0]?.url || null,
          requester
        });
      }
      return tracks;
    } catch (err) {
      console.error('Spotify resolution error:', err);
    }
  }

  // B. YouTube, YT Music & Search Queries via yt-dlp
  return new Promise((resolve) => {
    execFile(YT_DLP_PATH, ['-j', '--flat-playlist', '--default-search', 'ytsearch', query], (err, stdout) => {
      if (err || !stdout) {
        console.error('yt-dlp search error:', err);
        return resolve([]);
      }

      const lines = stdout.trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          const trackUrl = data.webpage_url || data.url || (data.id ? `https://www.youtube.com/watch?v=${data.id}` : null);
          const durationStr = data.duration 
            ? `${Math.floor(data.duration / 60)}:${(Math.floor(data.duration % 60)).toString().padStart(2, '0')}`
            : 'Unknown';

          if (trackUrl || data.title) {
            tracks.push({
              title: data.title || 'Unknown Title',
              searchTarget: trackUrl || `ytsearch:${data.title}`,
              url: trackUrl,
              duration: durationStr,
              thumbnail: data.thumbnails?.[0]?.url || null,
              requester
            });
          }
        } catch (e) {}
      }
      resolve(tracks);
    });
  });
}

// Helper: Create persistent Music Control Panel Embed & Rows
function createMusicPanelEmbedAndRows(guild) {
  const musicEmoji = getEmoji(guild, 'music');
  const playEmoji = getEmoji(guild, 'play');
  const pauseEmoji = getEmoji(guild, 'pause');
  const skipEmoji = getEmoji(guild, 'skip');
  const shuffleEmoji = getEmoji(guild, 'shuffle');
  const queueEmoji = getEmoji(guild, 'queue');
  const stopEmoji = getEmoji(guild, 'stop');

  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`${musicEmoji} Music Control Center`.trim())
    .setDescription(
      `Welcome to the **${guild.name}** Music Player!\n\n` +
      `Click **Play / Search** below to open a search prompt and play any song or playlist!\n\n` +
      `${playEmoji} **Play / Search** — Search song title, YouTube URL, or Spotify playlist\n` +
      `${pauseEmoji} **Pause / Resume** — Toggle playback pause state\n` +
      `${skipEmoji} **Skip** — Skip to the next track\n` +
      `${shuffleEmoji} **Shuffle** — Shuffle the upcoming song queue\n` +
      `${queueEmoji} **Queue** — View current playlist queue\n` +
      `${stopEmoji} **Stop** — Stop music and leave Voice Channel`
    )
    .setFooter({ text: `${guild.name} • Music Control Panel`, iconURL: guild.iconURL() })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    setButtonEmoji(new ButtonBuilder().setCustomId('music_panel_play').setLabel('Play / Search').setStyle(ButtonStyle.Success), playEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_toggle_pause').setLabel('Pause / Resume').setStyle(ButtonStyle.Primary), pauseEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary), skipEmoji)
  );

  const row2 = new ActionRowBuilder().addComponents(
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary), shuffleEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_queue').setLabel('Queue').setStyle(ButtonStyle.Secondary), queueEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_stop').setLabel('Stop').setStyle(ButtonStyle.Danger), stopEmoji)
  );

  return { embed, rows: [row1, row2] };
}

// Helper: Create interactive button control bar for Now Playing message
function createMusicControlRow(guild, isPaused = false) {
  const playEmoji = getEmoji(guild, 'play');
  const pauseEmoji = getEmoji(guild, 'pause');
  const skipEmoji = getEmoji(guild, 'skip');
  const shuffleEmoji = getEmoji(guild, 'shuffle');
  const queueEmoji = getEmoji(guild, 'queue');
  const stopEmoji = getEmoji(guild, 'stop');

  return new ActionRowBuilder().addComponents(
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_toggle_pause').setLabel(isPaused ? 'Resume' : 'Pause').setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary), isPaused ? playEmoji : pauseEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_skip').setLabel('Skip').setStyle(ButtonStyle.Secondary), skipEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_shuffle').setLabel('Shuffle').setStyle(ButtonStyle.Secondary), shuffleEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_queue').setLabel('Queue').setStyle(ButtonStyle.Secondary), queueEmoji),
    setButtonEmoji(new ButtonBuilder().setCustomId('music_btn_stop').setLabel('Stop').setStyle(ButtonStyle.Danger), stopEmoji)
  );
}

// Helper: Play next track in queue
async function playNext(guildId) {
  const sub = subscriptions.get(guildId);
  if (!sub) return;

  const guild = sub.textChannel ? sub.textChannel.guild : null;

  if (sub.currentProc) {
    try { sub.currentProc.kill('SIGKILL'); } catch (e) {}
    sub.currentProc = null;
  }

  if (sub.queue.length === 0) {
    sub.currentTrack = null;
    sub.isPaused = false;

    if (sub.textChannel) {
      const musicEmoji = getEmoji(guild, 'music');
      const finishedEmbed = new EmbedBuilder()
        .setColor(config.warningColor)
        .setTitle(`${musicEmoji} Queue Finished`.trim())
        .setDescription('No more songs in queue. Leaving voice channel in 3 minutes if inactive.')
        .setTimestamp();

      sub.textChannel.send({ embeds: [finishedEmbed] }).catch(() => {});
    }

    if (sub.disconnectTimer) clearTimeout(sub.disconnectTimer);
    sub.disconnectTimer = setTimeout(() => {
      if (sub.queue.length === 0 && !sub.currentTrack) {
        if (sub.voiceConnection) sub.voiceConnection.destroy();
        subscriptions.delete(guildId);
      }
    }, 180000);
    return;
  }

  if (sub.disconnectTimer) {
    clearTimeout(sub.disconnectTimer);
    sub.disconnectTimer = null;
  }

  const track = sub.queue.shift();
  sub.currentTrack = track;
  sub.isPaused = false;

  try {
    const target = track.url || track.searchTarget;
    const ytProc = spawn(YT_DLP_PATH, [
      '-f', 'bestaudio',
      '-o', '-',
      '--buffer-size', '16k',
      target
    ]);

    sub.currentProc = ytProc;

    ytProc.on('error', err => {
      console.error('ytProc process error:', err);
    });

    const resource = createAudioResource(ytProc.stdout);
    sub.audioPlayer.play(resource);

    if (sub.textChannel) {
      const nowplayingEmoji = getEmoji(guild, 'nowplaying');
      const npEmbed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${nowplayingEmoji} Now Playing`.trim())
        .setDescription(track.url ? `**[${track.title}](${track.url})**` : `**${track.title}**`)
        .addFields(
          { name: 'Duration', value: track.duration || 'Unknown', inline: true },
          { name: 'Requested By', value: `${track.requester}`, inline: true },
          { name: 'Queue Size', value: `${sub.queue.length} songs`, inline: true }
        );

      if (track.thumbnail) npEmbed.setThumbnail(track.thumbnail);

      const controlRow = createMusicControlRow(guild, false);

      const nowPlayingMsg = await sub.textChannel.send({ 
        embeds: [npEmbed], 
        components: [controlRow] 
      }).catch(() => null);

      if (nowPlayingMsg) sub.nowPlayingMsg = nowPlayingMsg;
    }
  } catch (err) {
    console.error(`Error streaming track ${track.title}:`, err);
    if (sub.textChannel) {
      const errEmoji = getEmoji(guild, 'error');
      sub.textChannel.send(`${errEmoji} Could not stream **${track.title}**. Skipping to next track...`.trim()).catch(() => {});
    }
    playNext(guildId);
  }
}

// Core helper: Process track queuing from either slash command or modal submission
async function processPlayRequest(guild, voiceChannel, textChannel, user, query) {
  const tracks = await resolveTracks(query, user);

  if (tracks.length === 0) {
    const errEmoji = getEmoji(guild, 'error');
    return { success: false, message: `${errEmoji} Could not find any playable music for that query!`.trim() };
  }

  let sub = subscriptions.get(guild.id);

  if (!sub) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    sub = {
      voiceConnection: connection,
      audioPlayer: player,
      queue: [],
      currentTrack: null,
      textChannel: textChannel,
      currentProc: null,
      disconnectTimer: null,
      isPaused: false
    };

    subscriptions.set(guild.id, sub);

    player.on(AudioPlayerStatus.Idle, () => {
      playNext(guild.id);
    });

    player.on('error', err => {
      console.error('Audio Player Error:', err);
      playNext(guild.id);
    });
  } else {
    sub.textChannel = textChannel;
  }

  sub.queue.push(...tracks);

  const playEmoji = getEmoji(guild, 'play');
  const checkEmoji = getEmoji(guild, 'check');

  if (!sub.currentTrack) {
    playNext(guild.id);
    const firstTrack = tracks[0];
    return { success: true, message: `${playEmoji} Joined ${voiceChannel} and playing **${firstTrack.title}**!`.trim() };
  } else {
    const addedMsg = tracks.length === 1
      ? `${checkEmoji} Added **${tracks[0].title}** to the queue at position #${sub.queue.length}!`.trim()
      : `${checkEmoji} Added **${tracks.length} songs** to the queue!`.trim();

    return { success: true, message: addedMsg };
  }
}

module.exports = {
  getSubscription,
  playNext,
  createMusicControlRow,
  processPlayRequest,
  data: new SlashCommandBuilder()
    .setName('music')
    .setDescription('Play music in voice channels')
    .addSubcommand(sub =>
      sub.setName('panel')
        .setDescription('Post music control panel')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Target channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('Play a song or playlist')
        .addStringOption(opt =>
          opt.setName('query')
            .setDescription('Song name or URL')
            .setRequired(true)
        )
    )
    .addSubcommand(sub => sub.setName('skip').setDescription('Skip current song'))
    .addSubcommand(sub => sub.setName('stop').setDescription('Stop and leave voice'))
    .addSubcommand(sub => sub.setName('pause').setDescription('Pause playback'))
    .addSubcommand(sub => sub.setName('resume').setDescription('Resume playback'))
    .addSubcommand(sub => sub.setName('shuffle').setDescription('Shuffle queue'))
    .addSubcommand(sub => sub.setName('clear').setDescription('Clear queue'))
    .addSubcommand(sub => sub.setName('queue').setDescription('View queue'))
    .addSubcommand(sub => sub.setName('nowplaying').setDescription('Show current song')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;
    const member = interaction.member;

    // 1. MUSIC PANEL COMMAND
    if (subcommand === 'panel') {
      const targetChannel = interaction.options.getChannel('channel') || interaction.channel;
      const { embed, rows } = createMusicPanelEmbedAndRows(guild);

      await targetChannel.send({ embeds: [embed], components: rows });

      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ 
        content: `${checkEmoji} Interactive Music Control Panel posted in ${targetChannel}!`.trim(), 
        ephemeral: true 
      });
    }

    const voiceChannel = member.voice.channel;

    // 2. PLAY COMMAND
    if (subcommand === 'play') {
      if (!voiceChannel) {
        const errEmoji = getEmoji(guild, 'error');
        return interaction.reply({ 
          content: `${errEmoji} You must be in a Voice Channel to play music!`.trim(), 
          ephemeral: true 
        });
      }

      await interaction.deferReply();
      const query = interaction.options.getString('query');

      const result = await processPlayRequest(guild, voiceChannel, interaction.channel, interaction.user, query);
      return interaction.editReply({ content: result.message });
    }

    const sub = subscriptions.get(guild.id);
    if (!sub || (!sub.currentTrack && sub.queue.length === 0)) {
      const errEmoji = getEmoji(guild, 'error');
      return interaction.reply({ 
        content: `${errEmoji} No music is currently playing on this server!`.trim(), 
        ephemeral: true 
      });
    }

    if (subcommand === 'skip') {
      const skipped = sub.currentTrack;
      if (sub.currentProc) {
        try { sub.currentProc.kill('SIGKILL'); } catch (e) {}
        sub.currentProc = null;
      }
      sub.audioPlayer.stop();
      const skipEmoji = getEmoji(guild, 'skip');
      return interaction.reply({ 
        content: `${skipEmoji} Skipped **${skipped ? skipped.title : 'song'}**!`.trim() 
      });
    }

    if (subcommand === 'stop') {
      sub.queue = [];
      sub.currentTrack = null;
      if (sub.currentProc) {
        try { sub.currentProc.kill('SIGKILL'); } catch (e) {}
        sub.currentProc = null;
      }
      sub.audioPlayer.stop();
      if (sub.voiceConnection) sub.voiceConnection.destroy();
      subscriptions.delete(guild.id);

      const stopEmoji = getEmoji(guild, 'stop');
      return interaction.reply({ 
        content: `${stopEmoji} Stopped music, cleared queue, and left the voice channel.`.trim() 
      });
    }

    if (subcommand === 'pause') {
      sub.audioPlayer.pause();
      sub.isPaused = true;
      const pauseEmoji = getEmoji(guild, 'pause');
      return interaction.reply({ content: `${pauseEmoji} Music paused.`.trim() });
    }

    if (subcommand === 'resume') {
      sub.audioPlayer.unpause();
      sub.isPaused = false;
      const playEmoji = getEmoji(guild, 'play');
      return interaction.reply({ content: `${playEmoji} Music resumed.`.trim() });
    }

    if (subcommand === 'shuffle') {
      if (sub.queue.length < 2) {
        const warnEmoji = getEmoji(guild, 'warning');
        return interaction.reply({ 
          content: `${warnEmoji} Need at least 2 songs in queue to shuffle!`.trim(), 
          ephemeral: true 
        });
      }

      for (let i = sub.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sub.queue[i], sub.queue[j]] = [sub.queue[j], sub.queue[i]];
      }

      const shuffleEmoji = getEmoji(guild, 'shuffle');
      return interaction.reply({ 
        content: `${shuffleEmoji} Shuffled **${sub.queue.length} songs** in the queue!`.trim() 
      });
    }

    if (subcommand === 'clear') {
      const count = sub.queue.length;
      sub.queue = [];
      const checkEmoji = getEmoji(guild, 'check');
      return interaction.reply({ 
        content: `${checkEmoji} Cleared **${count} songs** from the upcoming queue.`.trim() 
      });
    }

    if (subcommand === 'nowplaying') {
      const track = sub.currentTrack;
      if (!track) {
        const errEmoji = getEmoji(guild, 'error');
        return interaction.reply({ content: `${errEmoji} No song is currently playing!`.trim(), ephemeral: true });
      }

      const nowplayingEmoji = getEmoji(guild, 'nowplaying');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${nowplayingEmoji} Currently Playing`.trim())
        .setDescription(track.url ? `**[${track.title}](${track.url})**` : `**${track.title}**`)
        .addFields(
          { name: 'Duration', value: track.duration || 'Unknown', inline: true },
          { name: 'Requested By', value: `${track.requester}`, inline: true },
          { name: 'Songs in Queue', value: `${sub.queue.length}`, inline: true }
        );

      if (track.thumbnail) embed.setThumbnail(track.thumbnail);

      const controlRow = createMusicControlRow(guild, sub.isPaused);
      return interaction.reply({ embeds: [embed], components: [controlRow] });
    }

    if (subcommand === 'queue') {
      const current = sub.currentTrack;
      const queueList = sub.queue.slice(0, 10).map((t, idx) => `${idx + 1}. **${t.title}** (${t.duration}) - Requested by ${t.requester}`).join('\n');

      const queueEmoji = getEmoji(guild, 'queue');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${queueEmoji} Music Queue - ${guild.name}`.trim())
        .setDescription(
          `**Now Playing:**\n${current ? `**${current.title}** (${current.duration})` : 'None'}\n\n` +
          `**Upcoming Songs (${sub.queue.length}):**\n${queueList || 'No upcoming songs in queue.'}`
        )
        .setFooter({ text: sub.queue.length > 10 ? `...and ${sub.queue.length - 10} more songs.` : 'End of queue' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }
  },

  // Interactive Button Handler for Music Controls & Panel
  async handleButton(interaction) {
    const customId = interaction.customId;
    const guild = interaction.guild;

    // Handle Music Panel Play Search Prompt Modal
    if (customId === 'music_panel_play') {
      const modal = new ModalBuilder()
        .setCustomId('music_modal_play')
        .setTitle('Play / Search Song');

      const input = new TextInputBuilder()
        .setCustomId('music_query_input')
        .setLabel('Enter song title, YouTube URL, or Spotify link:')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g., Lofi Beats / Never Gonna Give You Up / Spotify playlist')
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(input);
      modal.addComponents(row);

      return interaction.showModal(modal);
    }

    const sub = subscriptions.get(guild.id);

    if (!sub || (!sub.currentTrack && sub.queue.length === 0)) {
      const errEmoji = getEmoji(guild, 'error');
      return interaction.reply({ 
        content: `${errEmoji} No music is currently playing! Click **Play / Search** to start playing music.`.trim(), 
        ephemeral: true 
      });
    }

    if (!interaction.member.voice.channel || interaction.member.voice.channel.id !== sub.voiceConnection.joinConfig.channelId) {
      const warnEmoji = getEmoji(guild, 'warning');
      return interaction.reply({ 
        content: `${warnEmoji} You must be in the same Voice Channel as the bot to use controls!`.trim(), 
        ephemeral: true 
      });
    }

    if (customId === 'music_btn_toggle_pause') {
      if (sub.isPaused) {
        sub.audioPlayer.unpause();
        sub.isPaused = false;
        const row = createMusicControlRow(guild, false);
        if (interaction.message.components.length === 1) {
          await interaction.message.edit({ components: [row] }).catch(() => {});
        }
        const playEmoji = getEmoji(guild, 'play');
        return interaction.reply({ content: `${playEmoji} Music resumed by ${interaction.user}!`.trim(), ephemeral: true });
      } else {
        sub.audioPlayer.pause();
        sub.isPaused = true;
        const row = createMusicControlRow(guild, true);
        if (interaction.message.components.length === 1) {
          await interaction.message.edit({ components: [row] }).catch(() => {});
        }
        const pauseEmoji = getEmoji(guild, 'pause');
        return interaction.reply({ content: `${pauseEmoji} Music paused by ${interaction.user}!`.trim(), ephemeral: true });
      }
    }

    if (customId === 'music_btn_skip') {
      const skipped = sub.currentTrack;
      if (sub.currentProc) {
        try { sub.currentProc.kill('SIGKILL'); } catch (e) {}
        sub.currentProc = null;
      }
      sub.audioPlayer.stop();
      const skipEmoji = getEmoji(guild, 'skip');
      return interaction.reply({ content: `${skipEmoji} ${interaction.user} skipped **${skipped ? skipped.title : 'song'}**!`.trim() });
    }

    if (customId === 'music_btn_shuffle') {
      if (sub.queue.length < 2) {
        const warnEmoji = getEmoji(guild, 'warning');
        return interaction.reply({ content: `${warnEmoji} Need at least 2 songs in queue to shuffle!`.trim(), ephemeral: true });
      }

      for (let i = sub.queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sub.queue[i], sub.queue[j]] = [sub.queue[j], sub.queue[i]];
      }

      const shuffleEmoji = getEmoji(guild, 'shuffle');
      return interaction.reply({ content: `${shuffleEmoji} ${interaction.user} shuffled **${sub.queue.length} songs** in the queue!`.trim() });
    }

    if (customId === 'music_btn_queue') {
      const current = sub.currentTrack;
      const queueList = sub.queue.slice(0, 10).map((t, idx) => `${idx + 1}. **${t.title}** (${t.duration}) - Requested by ${t.requester}`).join('\n');

      const queueEmoji = getEmoji(guild, 'queue');
      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`${queueEmoji} Music Queue - ${guild.name}`.trim())
        .setDescription(
          `**Now Playing:**\n${current ? `**${current.title}** (${current.duration})` : 'None'}\n\n` +
          `**Upcoming Songs (${sub.queue.length}):**\n${queueList || 'No upcoming songs in queue.'}`
        )
        .setFooter({ text: sub.queue.length > 10 ? `...and ${sub.queue.length - 10} more songs.` : 'End of queue' })
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (customId === 'music_btn_stop') {
      sub.queue = [];
      sub.currentTrack = null;
      if (sub.currentProc) {
        try { sub.currentProc.kill('SIGKILL'); } catch (e) {}
        sub.currentProc = null;
      }
      sub.audioPlayer.stop();
      if (sub.voiceConnection) sub.voiceConnection.destroy();
      subscriptions.delete(guild.id);

      const stopEmoji = getEmoji(guild, 'stop');
      return interaction.reply({ content: `${stopEmoji} ${interaction.user} stopped music and disconnected the bot.`.trim() });
    }
  }
};
