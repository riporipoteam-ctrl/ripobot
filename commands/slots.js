'use strict';

/**
 * /slots — spin a 3-reel slot machine for bonus XP.
 *   - Jackpot (all 3 match): +50 XP
 *   - Two of a kind: +10 XP
 *   - No match: no XP, playful message
 * The reels are always shown. A level-up message is appended when XP
 * pushes the user into a new level. Never crashes the user on failure.
 */

const { SlashCommandBuilder } = require('discord.js');
const { awardXP } = require('../utils/levels');

const REELS = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const JACKPOT_XP = 50;
const PAIR_XP = 10;

function spin() {
  return [
    REELS[Math.floor(Math.random() * REELS.length)],
    REELS[Math.floor(Math.random() * REELS.length)],
    REELS[Math.floor(Math.random() * REELS.length)],
  ];
}

function reelsLine(reels) {
  return `| ${reels[0]} | ${reels[1]} | ${reels[2]} |`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine for bonus XP')
    .setDMPermission(false),

  async execute(interaction) {
    const reels = spin();
    const line = reelsLine(reels);
    const [r1, r2, r3] = reels;

    let message;
    if (r1 === r2 && r2 === r3) {
      let result;
      try {
        result = awardXP(interaction.user.id, JACKPOT_XP);
      } catch (err) {
        console.error('[slots] awardXP failed:', err.message);
        result = null;
      }
      message =
        `🎰 JACKPOT! ${line} 🎉\n` +
        `Three of a kind — **+${JACKPOT_XP} XP**!`;
      if (result?.leveledUp) {
        message += `\nLevel up! You're now level ${result.level} 🎉`;
      }
    } else if (r1 === r2 || r2 === r3 || r1 === r3) {
      let result;
      try {
        result = awardXP(interaction.user.id, PAIR_XP);
      } catch (err) {
        console.error('[slots] awardXP failed:', err.message);
        result = null;
      }
      message =
        `🎰 Nice! Two of a kind ${line}\n` +
        `**+${PAIR_XP} XP** — so close to the big one!`;
      if (result?.leveledUp) {
        message += `\nLevel up! You're now level ${result.level} 🎉`;
      }
    } else {
      message = `🎰 ${line}\nNo luck this time, ${interaction.user.displayName} — spin again! 🍀`;
    }

    try {
      await interaction.reply({ content: message });
    } catch (err) {
      console.error('[slots] reply failed:', err.message);
    }
  },
};
