const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db/database');
const config = require('../config');
const { getEmoji, setButtonEmoji } = require('../utils/emojis');

// In-memory store for active minigames (Tic-Tac-Toe & RPS)
const activeGames = new Map();

// Periodic TTL memory cleanup (purges abandoned games after 15 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [msgId, game] of activeGames.entries()) {
    if (now - (game.createdAt || now) > 900000) {
      activeGames.delete(msgId);
    }
  }
}, 300000);

// Helper: Auto delete interaction message after specified delay
function scheduleMessageAutoDelete(message, delayMs = 30000) {
  if (!message || typeof message.delete !== 'function') return;
  setTimeout(() => {
    message.delete().catch(() => {});
  }, delayMs);
}

// 8Ball Answers (Balanced Positive, Neutral & Negative)
const eightBallAnswers = [
  "Yes, absolutely!",
  "It is certain!",
  "Without a single doubt, yes!",
  "You may rely on it.",
  "Most likely!",
  "Signs point to YES!",
  "Reply hazy, try asking again.",
  "Ask again later...",
  "Better not tell you now!",
  "Cannot predict right now.",
  "Concentrate and ask again.",
  "Don't count on it.",
  "My sources say NO.",
  "Outlook not so good.",
  "Very doubtful.",
  "Absolutely NOT."
];

// Helper: Build 3x3 Tic-Tac-Toe Board
function buildTicTacToeBoard(game, guild) {
  const rows = [];
  const crossEmoji = getEmoji(guild, 'cross');
  const checkEmoji = getEmoji(guild, 'check');

  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const index = r * 3 + c;
      const cell = game.board[index];

      let style = ButtonStyle.Secondary;
      if (cell === 'X') style = ButtonStyle.Danger;
      else if (cell === 'O') style = ButtonStyle.Primary;

      const btn = new ButtonBuilder()
        .setCustomId(`ttt_${index}`)
        .setLabel(cell ? cell : ' ')
        .setStyle(style)
        .setDisabled(game.ended || cell !== null);

      if (cell === 'X') setButtonEmoji(btn, crossEmoji);
      else if (cell === 'O') setButtonEmoji(btn, checkEmoji);

      row.addComponents(btn);
    }
    rows.push(row);
  }
  return rows;
}

// Helper: Check Tic-Tac-Toe Win Conditions
function checkTicTacToeWin(board) {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
  ];

  for (const pat of winPatterns) {
    const [a, b, c] = pat;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every(cell => cell !== null)) {
    return 'TIE';
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('minigame')
    .setDescription('Play minigames')
    .addSubcommand(sub =>
      sub.setName('tictactoe')
        .setDescription('Play Tic-Tac-Toe')
        .addUserOption(opt => opt.setName('opponent').setDescription('Opponent').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('rps')
        .setDescription('Rock Paper Scissors')
        .addUserOption(opt => opt.setName('opponent').setDescription('Opponent (empty for bot)').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('8ball')
        .setDescription('Ask the Magic 8-Ball')
        .addStringOption(opt => opt.setName('question').setDescription('Question').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('coinflip').setDescription('Flip a coin'))
    .addSubcommand(sub =>
      sub.setName('roll')
        .setDescription('Roll a dice')
        .addIntegerOption(opt => opt.setName('max').setDescription('Max number (default: 100)').setMinValue(2).setRequired(false))
    ),

  async execute(interaction) {
    const guild = interaction.guild;
    const subcommand = interaction.options.getSubcommand();
    const guildConfig = db.getGuildConfig(guild.id);

    // 1. MINIGAME CHANNEL RESTRICTION CHECK
    if (guildConfig.minigameChannelId && interaction.channel.id !== guildConfig.minigameChannelId) {
      const denyEmoji = getEmoji(guild, 'Deny');
      return interaction.reply({
        content: `${denyEmoji} Minigames are restricted to <#${guildConfig.minigameChannelId}>! Please head over there to play.`.trim(),
        ephemeral: true
      });
    }

    // 2. TIC-TAC-TOE
    if (subcommand === 'tictactoe') {
      const opponent = interaction.options.getUser('opponent');

      const denyEmoji = getEmoji(guild, 'Deny');
      if (opponent.bot) {
        return interaction.reply({ content: `${denyEmoji} You cannot play Tic-Tac-Toe against a bot!`.trim(), ephemeral: true });
      }

      if (opponent.id === interaction.user.id) {
        return interaction.reply({ content: `${denyEmoji} You cannot play against yourself!`.trim(), ephemeral: true });
      }

      const game = {
        playerX: interaction.user,
        playerO: opponent,
        turn: interaction.user.id,
        board: Array(9).fill(null),
        ended: false
      };

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('TIC-TAC-TOE')
        .setDescription(`**Player X:** ${game.playerX}\n**Player O:** ${game.playerO}\n\nCurrent Turn: ${game.playerX} (X)`)
        .setFooter({ text: 'Click an empty square to make your move! Auto-deletes 30s after completion.' });

      const rows = buildTicTacToeBoard(game, guild);
      const reply = await interaction.reply({ 
        content: `${opponent}, you have been challenged to Tic-Tac-Toe by ${interaction.user}!`, 
        embeds: [embed], 
        components: rows, 
        fetchReply: true 
      });

      game.messageId = reply.id;
      activeGames.set(reply.id, { type: 'ttt', data: game, createdAt: Date.now() });
      return;
    }

    // 3. ROCK PAPER SCISSORS
    if (subcommand === 'rps') {
      const opponent = interaction.options.getUser('opponent');

      if (opponent && opponent.id === interaction.user.id) {
        const denyEmoji = getEmoji(guild, 'Deny');
        return interaction.reply({ content: `${denyEmoji} You cannot play against yourself!`.trim(), ephemeral: true });
      }

      const isVsBot = !opponent || opponent.bot;

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('ROCK PAPER SCISSORS')
        .setDescription(isVsBot
          ? `Choose your move below!`
          : `**Player 1:** ${interaction.user}\n**Player 2:** ${opponent}\n\nBoth players click a button below to lock in your move secretly!`)
        .setFooter({ text: 'Make your move! Auto-deletes 30s after completion.' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('Rock').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('Paper').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('Scissors').setStyle(ButtonStyle.Danger)
      );

      const reply = await interaction.reply({
        content: isVsBot ? undefined : `${opponent}, you've been challenged to RPS by ${interaction.user}!`,
        embeds: [embed],
        components: [row],
        fetchReply: true
      });

      activeGames.set(reply.id, {
        type: 'rps',
        data: {
          messageId: reply.id,
          player1: interaction.user,
          player2: isVsBot ? interaction.client.user : opponent,
          isVsBot,
          moves: {}
        },
        createdAt: Date.now()
      });
      return;
    }

    // 4. 8BALL (Auto-deletes after 25s)
    if (subcommand === '8ball') {
      const question = interaction.options.getString('question');
      const randomAnswer = eightBallAnswers[Math.floor(Math.random() * eightBallAnswers.length)];

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`Magic 8-Ball`)
        .addFields(
          { name: 'Question', value: question },
          { name: 'Answer', value: randomAnswer }
        )
        .setFooter({ text: `Asked by ${interaction.user.tag} • Auto-deletes in 25s` })
        .setTimestamp();

      const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
      scheduleMessageAutoDelete(reply, 25000);
      return;
    }

    // 5. COINFLIP (Auto-deletes after 20s)
    if (subcommand === 'coinflip') {
      const result = Math.random() < 0.5 ? 'Heads' : 'Tails';

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`Coin Flip`)
        .setDescription(`The coin landed on: **${result}**!`)
        .setFooter({ text: 'Auto-deletes in 20s' })
        .setTimestamp();

      const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
      scheduleMessageAutoDelete(reply, 20000);
      return;
    }

    // 6. ROLL (Auto-deletes after 20s)
    if (subcommand === 'roll') {
      const max = interaction.options.getInteger('max') || 100;
      const roll = Math.floor(Math.random() * max) + 1;

      const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`Dice Roll`)
        .setDescription(`**${interaction.user.username}** rolled a **${roll}** (out of ${max})!`)
        .setFooter({ text: 'Auto-deletes in 20s' })
        .setTimestamp();

      const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
      scheduleMessageAutoDelete(reply, 20000);
      return;
    }
  },

  // Button interaction handlers for games
  async handleButton(interaction) {
    const customId = interaction.customId;
    const messageId = interaction.message.id;
    const guild = interaction.guild;

    // --- A. TIC-TAC-TOE BUTTON HANDLING ---
    if (customId.startsWith('ttt_')) {
      const active = activeGames.get(messageId);
      if (!active || active.type !== 'ttt') return;

      const game = active.data;
      const denyEmoji = getEmoji(guild, 'Deny');

      if (interaction.user.id !== game.turn) {
        return interaction.reply({ content: `${denyEmoji} It is not your turn!`.trim(), ephemeral: true });
      }

      const cellIndex = parseInt(customId.replace('ttt_', ''), 10);
      if (game.board[cellIndex] !== null) {
        return interaction.reply({ content: `${denyEmoji} That square is already taken!`.trim(), ephemeral: true });
      }

      const symbol = interaction.user.id === game.playerX.id ? 'X' : 'O';
      game.board[cellIndex] = symbol;

      const winResult = checkTicTacToeWin(game.board);

      if (winResult) {
        game.ended = true;
        activeGames.delete(messageId);

        let statusText = '';
        if (winResult === 'TIE') {
          statusText = '**Game ended in a TIE!**';
        } else {
          const winner = winResult === 'X' ? game.playerX : game.playerO;
          statusText = `**${winner} (${winResult}) WINS THE GAME!**`;
        }

        const embed = EmbedBuilder.from(interaction.message.embeds[0])
          .setDescription(`**Player X:** ${game.playerX}\n**Player O:** ${game.playerO}\n\n${statusText}`)
          .setColor(winResult === 'TIE' ? config.warningColor : config.successColor)
          .setFooter({ text: 'Game Over • Auto-deletes in 30s' });

        const rows = buildTicTacToeBoard(game, guild);
        await interaction.message.edit({ content: null, embeds: [embed], components: rows }).catch(() => {});
        scheduleMessageAutoDelete(interaction.message, 30000);
        return interaction.deferUpdate();
      }

      game.turn = interaction.user.id === game.playerX.id ? game.playerO.id : game.playerX.id;
      const nextPlayer = game.turn === game.playerX.id ? game.playerX : game.playerO;
      const nextSymbol = game.turn === game.playerX.id ? 'X' : 'O';

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setDescription(`**Player X:** ${game.playerX}\n**Player O:** ${game.playerO}\n\nCurrent Turn: ${nextPlayer} (${nextSymbol})`);

      const rows = buildTicTacToeBoard(game, guild);
      await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
      return interaction.deferUpdate();
    }

    // --- B. ROCK PAPER SCISSORS BUTTON HANDLING ---
    if (customId.startsWith('rps_')) {
      const active = activeGames.get(messageId);
      if (!active || active.type !== 'rps') return;

      const game = active.data;
      const choice = customId.replace('rps_', '');
      const denyEmoji = getEmoji(guild, 'Deny');

      if (game.isVsBot) {
        if (interaction.user.id !== game.player1.id) {
          return interaction.reply({ content: `${denyEmoji} Only the game host can pick a move!`.trim(), ephemeral: true });
        }

        const botChoices = ['rock', 'paper', 'scissors'];
        const botChoice = botChoices[Math.floor(Math.random() * botChoices.length)];

        let resultText = '';
        if (choice === botChoice) {
          resultText = "**It's a Tie!**";
        } else if (
          (choice === 'rock' && botChoice === 'scissors') ||
          (choice === 'paper' && botChoice === 'rock') ||
          (choice === 'scissors' && botChoice === 'paper')
        ) {
          resultText = `**${interaction.user.username} WINS!**`;
        } else {
          resultText = `**Bot WINS!**`;
        }

        const moves = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('ROCK PAPER SCISSORS')
          .setDescription(`**${interaction.user.username}:** ${moves[choice]}\n**Bot:** ${moves[botChoice]}\n\n${resultText}`)
          .setFooter({ text: 'Auto-deletes in 25s' })
          .setTimestamp();

        activeGames.delete(messageId);
        await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
        scheduleMessageAutoDelete(interaction.message, 25000);
        return interaction.deferUpdate();
      } else {
        if (interaction.user.id !== game.player1.id && interaction.user.id !== game.player2.id) {
          return interaction.reply({ content: `${denyEmoji} You are not part of this RPS match!`.trim(), ephemeral: true });
        }

        game.moves[interaction.user.id] = choice;

        if (!game.moves[game.player1.id] || !game.moves[game.player2.id]) {
          const acceptEmoji = getEmoji(guild, 'Accept');
          await interaction.reply({ content: `${acceptEmoji} Move locked in secretly! Waiting for the other player...`.trim(), ephemeral: true });
          return;
        }

        const p1Move = game.moves[game.player1.id];
        const p2Move = game.moves[game.player2.id];
        const moves = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' };

        let resultText = '';
        if (p1Move === p2Move) {
          resultText = "**It's a Tie!**";
        } else if (
          (p1Move === 'rock' && p2Move === 'scissors') ||
          (p1Move === 'paper' && p2Move === 'rock') ||
          (p1Move === 'scissors' && p2Move === 'paper')
        ) {
          resultText = `**${game.player1} WINS!**`;
        } else {
          resultText = `**${game.player2} WINS!**`;
        }

        const embed = new EmbedBuilder()
          .setColor(config.embedColor)
          .setTitle('ROCK PAPER SCISSORS')
          .setDescription(`**${game.player1.username}:** ${moves[p1Move]}\n**${game.player2.username}:** ${moves[p2Move]}\n\n${resultText}`)
          .setFooter({ text: 'Auto-deletes in 25s' })
          .setTimestamp();

        activeGames.delete(messageId);
        await interaction.message.edit({ embeds: [embed], components: [] }).catch(() => {});
        scheduleMessageAutoDelete(interaction.message, 25000);
        return interaction.reply({ content: 'Match completed!', ephemeral: true });
      }
    }
  }
};
