'use strict';

/**
 * /math — public command that evaluates an arithmetic expression.
 *
 * Uses a hand-written tokenizer plus a shunting-yard parser. Supports
 * + - * / ^ % parentheses, decimals, and unary minus. Input is never
 * executed as code — it is parsed token by token.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { failEphemeral } = require('../utils/permissions');

const PARSE_ERROR = '🤔 I couldn\u2019t parse that \u2014 try something like (2+3)*4';

/** Split the expression into number/operator tokens; throws on bad input. */
function tokenize(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t') { i += 1; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      let dots = 0;
      while (i < input.length && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) {
        if (input[i] === '.') dots += 1;
        if (dots > 1) throw new Error('bad number');
        num += input[i];
        i += 1;
      }
      if (num === '.' || num === '') throw new Error('bad number');
      const value = parseFloat(num);
      if (!Number.isFinite(value)) throw new Error('bad number');
      tokens.push({ type: 'num', value });
      continue;
    }
    if ('+-*/%^()'.includes(ch)) {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    throw new Error(`invalid character: ${ch}`);
  }
  if (!tokens.length) throw new Error('empty');
  return tokens;
}

/** Convert infix tokens to reverse-Polish notation (shunting-yard). */
function toRPN(tokens) {
  const out = [];
  const stack = [];
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3, 'u-': 4 };
  const rightAssoc = { '^': true, 'u-': true };
  let prev = null; // 'num' | '(' | 'op' | null

  for (const t of tokens) {
    if (t.type === 'num') {
      out.push(t);
      prev = 'num';
      continue;
    }
    const v = t.value;
    if (v === '(') {
      stack.push(v);
      prev = '(';
      continue;
    }
    if (v === ')') {
      let found = false;
      while (stack.length) {
        const top = stack.pop();
        if (top === '(') { found = true; break; }
        out.push({ type: 'op', value: top });
      }
      if (!found) throw new Error('mismatched parentheses');
      prev = 'num';
      continue;
    }
    let op = v;
    if ((v === '-' || v === '+') && (prev === null || prev === '(' || prev === 'op')) {
      if (v === '+') { prev = 'op'; continue; } // unary plus is a no-op
      op = 'u-';
    }
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top === '(') break;
      if (prec[top] > prec[op] || (prec[top] === prec[op] && !rightAssoc[op])) {
        out.push({ type: 'op', value: stack.pop() });
      } else {
        break;
      }
    }
    stack.push(op);
    prev = 'op';
  }

  while (stack.length) {
    const top = stack.pop();
    if (top === '(') throw new Error('mismatched parentheses');
    out.push({ type: 'op', value: top });
  }
  return out;
}

/** Evaluate the RPN token list; throws on invalid math. */
function computeRPN(rpn) {
  const stack = [];
  for (const t of rpn) {
    if (t.type === 'num') {
      stack.push(t.value);
      continue;
    }
    if (t.value === 'u-') {
      if (!stack.length) throw new Error('syntax');
      stack.push(-stack.pop());
      continue;
    }
    if (stack.length < 2) throw new Error('syntax');
    const b = stack.pop();
    const a = stack.pop();
    let r;
    switch (t.value) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '*': r = a * b; break;
      case '/':
        if (b === 0) throw new Error('division by zero');
        r = a / b;
        break;
      case '%':
        if (b === 0) throw new Error('division by zero');
        r = a % b;
        break;
      case '^': r = Math.pow(a, b); break;
      default: throw new Error('syntax');
    }
    if (!Number.isFinite(r)) throw new Error('result out of range');
    stack.push(r);
  }
  if (stack.length !== 1) throw new Error('syntax');
  return stack[0];
}

/** Format a number cleanly (no float dust, no ugly trailing zeros). */
function formatResult(n) {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
  const s = n.toPrecision(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  return s;
}

function evaluate(expression) {
  const rpn = toRPN(tokenize(expression));
  return computeRPN(rpn);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('math')
    .setDescription('Safely calculate an arithmetic expression')
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName('expression')
      .setDescription('e.g. (2+3)*4, 2^10, 15%4')
      .setRequired(true)
      .setMaxLength(200)),

  async execute(interaction) {
    try {
      const expression = interaction.options.getString('expression', true).trim();

      let result;
      try {
        result = evaluate(expression);
      } catch (err) {
        if (err.message === 'division by zero') {
          await failEphemeral(interaction, '🚫 Can\u2019t divide by zero!');
        } else {
          await failEphemeral(interaction, PARSE_ERROR);
        }
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('🧮 Calculator')
        .addFields(
          { name: 'Expression', value: `\`${expression.slice(0, 200)}\`` },
          { name: 'Result', value: `**\`${formatResult(result)}\`**` },
        );

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[math] execute failed:', err.message);
      await failEphemeral(interaction, 'Something went wrong');
    }
  },
};
