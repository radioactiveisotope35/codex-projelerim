import { Telegraf } from 'telegraf';
import { config as loadEnv } from 'dotenv';

loadEnv();


const BOT_TOKEN = process.env.BOT_TOKEN;
const SIGNAL_INTERVAL_MINUTES = Number.parseInt(process.env.SIGNAL_INTERVAL_MINUTES ?? '', 10);
const DEFAULT_INTERVAL_MINUTES = Number.isFinite(SIGNAL_INTERVAL_MINUTES) && SIGNAL_INTERVAL_MINUTES > 0
  ? SIGNAL_INTERVAL_MINUTES
  : 90;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is missing. Set it in the environment or .env file.');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

const PAIR_CONFIG = {
  XAUUSD: {
    display: 'Gold (XAU/USD)',
    basePrice: 1940,
    atr: 14.5,
    cycleHours: 16,
    slowCycleHours: 96,
    phaseOffset: 0.9,
    bias: 0.18,
  },
  XAGUSD: {
    display: 'Silver (XAG/USD)',
    basePrice: 24.1,
    atr: 0.42,
    cycleHours: 20,
    slowCycleHours: 120,
    phaseOffset: 0.35,
    bias: -0.05,
  },
  XPTUSD: {
    display: 'Platinum (XPT/USD)',
    basePrice: 930,
    atr: 12.5,
    cycleHours: 18,
    slowCycleHours: 144,
    phaseOffset: 1.8,
    bias: 0.07,
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function computeOscillator(pairKey, when = new Date()) {
  const cfg = PAIR_CONFIG[pairKey];
  if (!cfg) {
    throw new Error(`Unknown pair ${pairKey}`);
  }
  const hourIndex = Math.floor(when.getTime() / (60 * 60 * 1000));
  const fastComponent = Math.sin(((hourIndex % cfg.cycleHours) / cfg.cycleHours) * Math.PI * 2 + cfg.phaseOffset);
  const slowComponent = Math.sin((hourIndex / cfg.slowCycleHours) * Math.PI * 2 + cfg.phaseOffset / 2);
  const blended = fastComponent * 0.55 + slowComponent * 0.35 + cfg.bias;
  return clamp(blended, -1, 1);
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function generateTradeIdea(pairKey, when = new Date()) {
  const cfg = PAIR_CONFIG[pairKey];
  if (!cfg) {
    throw new Error(`Unknown pair ${pairKey}`);
  }
  const osc = computeOscillator(pairKey, when);
  const direction = osc >= 0 ? 'LONG' : 'SHORT';
  const strength = Math.abs(osc);
  const entry = cfg.basePrice + osc * cfg.atr * 0.6;
  const riskDistance = cfg.atr * (0.8 + strength * 0.7);
  const rewardDistance = riskDistance * (1.6 + strength * 0.8);
  const takeProfit = direction === 'LONG' ? entry + rewardDistance : entry - rewardDistance;
  const stopLoss = direction === 'LONG' ? entry - riskDistance : entry + riskDistance;

  const narrative = direction === 'LONG'
    ? 'Momentum favours demand on dips; look for rotation into higher highs.'
    : 'Supply remains in control; rallies into resistance are opportunities to fade.';

  return {
    pair: pairKey,
    display: cfg.display,
    direction,
    entry: roundTo(entry, entry >= 100 ? 1 : 3),
    takeProfit: roundTo(takeProfit, takeProfit >= 100 ? 1 : 3),
    stopLoss: roundTo(stopLoss, stopLoss >= 100 ? 1 : 3),
    riskReward: roundTo(rewardDistance / riskDistance, 2),
    confidence: Math.round(strength * 100),
    narrative,
    generatedAt: when,
  };
}

function formatTradeIdea(idea) {
  const when = idea.generatedAt.toISOString().replace('T', ' ').replace(/\..+/, '');
  return [
    `📊 <b>${idea.display}</b>`,
    `Signal: <b>${idea.direction}</b> (confidence ${idea.confidence}%)`,
    `Entry: <code>${idea.entry}</code>`,
    `Take Profit: <code>${idea.takeProfit}</code>`,
    `Stop Loss: <code>${idea.stopLoss}</code>`,
    `Risk/Reward: <code>${idea.riskReward}:1</code>`,
    '',
    idea.narrative,
    '',
    `Generated: ${when} UTC`,
  ].join('\n');
}

async function sendIdeas(chatId, ctx, when = new Date()) {
  const ideas = Object.keys(PAIR_CONFIG).map((pair) => generateTradeIdea(pair, when));
  const message = ideas.map(formatTradeIdea).join('\n\n');
  await ctx.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
}

let broadcastChatId = process.env.TARGET_CHAT_ID ? String(process.env.TARGET_CHAT_ID).trim() : '';
let broadcastTimer = null;
let nextBroadcastTime = null;

function scheduleBroadcasts(ctx) {
  if (!broadcastChatId) {
    return;
  }
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
  }
  const intervalMs = DEFAULT_INTERVAL_MINUTES * 60 * 1000;
  const dispatch = () => {
    const now = Date.now();
    sendIdeas(broadcastChatId, ctx)
      .then(() => {
        nextBroadcastTime = now + intervalMs;
      })
      .catch((err) => {
        console.error('Failed to send scheduled ideas:', err);
      });
  };
  dispatch();
  broadcastTimer = setInterval(dispatch, intervalMs);
  nextBroadcastTime = Date.now() + intervalMs;
}

bot.start(async (ctx) => {
  const welcome = [
    'Welcome to the precious metals strategy desk. ⚙️',
    '',
    'Commands:',
    '/signal — get the latest trading plan for all tracked pairs.',
    '/watch — subscribe this chat to periodic updates.',
    '/unwatch — stop automated updates.',
    '/status — inspect the current schedule.',
  ].join('\n');
  await ctx.reply(welcome);
  if (broadcastChatId && String(ctx.chat.id) === broadcastChatId) {
    await ctx.reply(`This chat is already scheduled for ${DEFAULT_INTERVAL_MINUTES}-minute broadcasts.`);
  }
});

bot.command('signal', async (ctx) => {
  await sendIdeas(ctx.chat.id, ctx);
});

bot.command('watch', async (ctx) => {
  broadcastChatId = String(ctx.chat.id);
  await ctx.reply(`Subscribed this chat for trade ideas every ${DEFAULT_INTERVAL_MINUTES} minutes.`);
  scheduleBroadcasts(ctx);
});

bot.command('unwatch', async (ctx) => {
  if (!broadcastChatId) {
    await ctx.reply('No chat is currently scheduled.');
    return;
  }
  if (String(ctx.chat.id) !== broadcastChatId) {
    await ctx.reply('Only the subscribed chat can stop the broadcast.');
    return;
  }
  broadcastChatId = '';
  if (broadcastTimer) {
    clearInterval(broadcastTimer);
    broadcastTimer = null;
  }
  nextBroadcastTime = null;
  await ctx.reply('Automated broadcasts paused. Use /watch to enable them again.');
});

bot.command('status', async (ctx) => {
  if (!broadcastChatId) {
    await ctx.reply('No automated broadcasts are configured. Use /watch in the target chat.');
    return;
  }
  const minutesRemaining = typeof nextBroadcastTime === 'number'
    ? Math.max(0, Math.round((nextBroadcastTime - Date.now()) / 60000))
    : null;
  const nextRun = minutesRemaining === null ? 'unknown' : `${minutesRemaining} minutes (approx.)`;
  await ctx.reply(
    `Broadcast chat: ${broadcastChatId}\n` +
    `Interval: ${DEFAULT_INTERVAL_MINUTES} minutes\n` +
    `Next run in: ${nextRun}`
  );
});

bot.catch((err, ctx) => {
  console.error(`Update ${ctx?.update?.update_id ?? 'unknown'} failed:`, err);
});

bot.launch().then(() => {
  console.log('Trade idea bot launched.');
  if (broadcastChatId) {
    scheduleBroadcasts(bot);
  }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
