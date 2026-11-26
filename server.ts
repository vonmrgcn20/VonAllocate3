import 'dotenv/config';
import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_CATEGORY_COLORS = [
  'blue',
  'emerald',
  'amber',
  'purple',
  'rose',
  'cyan',
  'orange',
  'pink',
] as const;

interface ToBuyContextCategory {
  id: string;
  name: string;
  color?: string;
}

interface ToBuyContextItem {
  id: string;
  title: string;
  categoryName: string;
  price: number;
  bank: string;
  deadline: string;
  syncedToFixed: boolean;
  checked: boolean;
  note: string;
}

interface DebtSummaryItem {
  label: string;
  provider: string;
  remaining: number;
  weeklyNeeded: number;
  dueDate: string;
  locked: boolean;
}

interface ToBuyAiContext {
  todayISO: string;
  baseIncomeWeekly: number;
  extraIncomeWeekly: number;
  fixedWeeklyTotal: number;
  variableWeeklyTotal: number;
  minDailyFoodWeekly: number;
  totalDebtRemaining: number;
  weeklyDebtRequired: number;
  activeDebts: DebtSummaryItem[];
  banks: string[];
  toBuyCategories: ToBuyContextCategory[];
  toBuyItems: ToBuyContextItem[];
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    const err = new Error('Gemini API key is not configured in Settings > Secrets.') as Error & {
      statusCode?: number;
    };
    err.statusCode = 503;
    throw err;
  }

  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function clampString(val: unknown, maxLen: number): string {
  return String(val ?? '').trim().slice(0, maxLen);
}

function clampNumber(val: unknown, min = 0, max = 100000000): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitizeContext(raw: unknown): ToBuyAiContext {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const activeDebts: DebtSummaryItem[] = Array.isArray(obj.activeDebts)
    ? obj.activeDebts.slice(0, 30).map((d) => {
        const item = d && typeof d === 'object' ? (d as Record<string, unknown>) : {};
        return {
          label: clampString(item.label, 80),
          provider: clampString(item.provider, 30),
          remaining: clampNumber(item.remaining),
          weeklyNeeded: clampNumber(item.weeklyNeeded),
          dueDate: clampString(item.dueDate, 20),
          locked: Boolean(item.locked),
        };
      })
    : [];

  const banks: string[] = Array.isArray(obj.banks)
    ? obj.banks
        .slice(0, 25)
        .map((b) => clampString(b, 40))
        .filter(Boolean)
    : ['Maya', 'GoTyme', 'CIMB', 'ShopeePay', 'GCash', 'Cash'];

  const toBuyCategories: ToBuyContextCategory[] = Array.isArray(obj.toBuyCategories)
    ? obj.toBuyCategories.slice(0, 60).map((c) => {
        const cat = c && typeof c === 'object' ? (c as Record<string, unknown>) : {};
        return {
          id: clampString(cat.id, 64),
          name: clampString(cat.name, 60),
          color: clampString(cat.color, 20),
        };
      })
    : [];

  const toBuyItems: ToBuyContextItem[] = Array.isArray(obj.toBuyItems)
    ? obj.toBuyItems.slice(0, 150).map((t) => {
        const item = t && typeof t === 'object' ? (t as Record<string, unknown>) : {};
        return {
          id: clampString(item.id, 64),
          title: clampString(item.title, 100),
          categoryName: clampString(item.categoryName, 60),
          price: clampNumber(item.price),
          bank: clampString(item.bank, 40),
          deadline: clampString(item.deadline, 20),
          syncedToFixed: Boolean(item.syncedToFixed),
          checked: Boolean(item.checked),
          note: clampString(item.note, 220),
        };
      })
    : [];

  return {
    todayISO: clampString(obj.todayISO, 20) || new Date().toISOString().slice(0, 10),
    baseIncomeWeekly: clampNumber(obj.baseIncomeWeekly),
    extraIncomeWeekly: clampNumber(obj.extraIncomeWeekly),
    fixedWeeklyTotal: clampNumber(obj.fixedWeeklyTotal),
    variableWeeklyTotal: clampNumber(obj.variableWeeklyTotal),
    minDailyFoodWeekly: clampNumber(obj.minDailyFoodWeekly),
    totalDebtRemaining: clampNumber(obj.totalDebtRemaining),
    weeklyDebtRequired: clampNumber(obj.weeklyDebtRequired),
    activeDebts,
    banks: banks.length > 0 ? banks : ['Maya', 'GoTyme', 'CIMB', 'ShopeePay', 'GCash', 'Cash'],
    toBuyCategories,
    toBuyItems,
  };
}

function buildFinancialBrief(ctx: ToBuyAiContext): string {
  const totalWeeklyIncome = ctx.baseIncomeWeekly + ctx.extraIncomeWeekly;
  const nonDebtCommitments = ctx.fixedWeeklyTotal + ctx.variableWeeklyTotal + ctx.minDailyFoodWeekly;
  const estimatedWeeklySurplus = Math.max(
    0,
    Number((totalWeeklyIncome - ctx.weeklyDebtRequired - nonDebtCommitments).toFixed(2))
  );

  return JSON.stringify(
    {
      todayISO: ctx.todayISO,
      currency: 'PHP',
      weeklyIncome: {
        base: ctx.baseIncomeWeekly,
        extra: ctx.extraIncomeWeekly,
        total: totalWeeklyIncome,
      },
      weeklyCommitments: {
        debtRequiredFirst: ctx.weeklyDebtRequired,
        fixedExpenses: ctx.fixedWeeklyTotal,
        variableExpenses: ctx.variableWeeklyTotal,
        minFoodBuffer: ctx.minDailyFoodWeekly,
        estimatedSafeWeeklySurplusForToBuy: estimatedWeeklySurplus,
      },
      debtStatus: {
        totalDebtRemaining: ctx.totalDebtRemaining,
        activeDebts: ctx.activeDebts,
      },
      availableWallets: ctx.banks,
      existingCategories: ctx.toBuyCategories,
      currentToBuyItems: ctx.toBuyItems.filter((i) => !i.checked),
    },
    null,
    2
  );
}

async function handleNotepadRequest(
  ai: GoogleGenAI,
  notepadText: string,
  scenarioNote: string,
  ctx: ToBuyAiContext
) {
  // Step 1: Grounded Market Research on Shopee PH, Lazada PH, and TikTok Shop PH
  let marketResearchText = '';
  const verifiedLinks: Array<{ title: string; uri: string }> = [];

  try {
    const researchPrompt = [
      'Search Shopee Philippines (shopee.ph), Lazada Philippines (lazada.com.ph), and TikTok Shop Philippines for the products listed in this user notepad.',
      'For EACH item:',
      '1) Estimate a realistic Philippines selling price in PHP based on Shopee PH, Lazada PH, or TikTok Shop PH listings (especially if no price was provided).',
      '2) Look for a reputable listing that has HIGH STARS (4.7+ stars), GOOD REVIEWS, and MANY SOLDS (e.g., hundreds/thousands sold, Mall or Preferred/Top Seller).',
      '3) Note the platform (Shopee, Lazada, or TikTok Shop), rating & sold count if visible, and exact listing URL if found.',
      '',
      'USER NOTEPAD ITEMS:',
      notepadText,
    ].join('\n');

    const researchResponse = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: researchPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    marketResearchText = (researchResponse.text ?? '').trim();
    const chunks = researchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (Array.isArray(chunks)) {
      const seenUris = new Set<string>();
      for (const chunk of chunks) {
        const uri = clampString(chunk?.web?.uri, 500);
        const title = clampString(chunk?.web?.title, 140);
        if (uri && /^https?:\/\//i.test(uri) && !seenUris.has(uri)) {
          seenUris.add(uri);
          verifiedLinks.push({ title: title || uri, uri });
          if (verifiedLinks.length >= 30) break;
        }
      }
    }
  } catch (err) {
    const e = err as Error & { status?: number; statusCode?: number };
    const msg = e.message || '';
    const status = e.statusCode || e.status || 500;
    if (
      status === 400 ||
      status === 403 ||
      status === 429 ||
      status === 503 ||
      msg.includes('API_KEY_INVALID') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('RESOURCE_EXHAUSTED')
    ) {
      throw err;
    }
    console.warn('Market search grounding step skipped due to transient error:', msg);
  }

  const systemInstruction = [
    'You are the Von Allocator To-Buy AI Organizer and Debt-Free Financial Coach.',
    'Core Financial Rules:',
    '1) The user goal is to stay DEBT-FREE (never delay active SPaylater/SLoan payments) and ALWAYS SAVE 100% BEFORE BUYING.',
    '2) Parse the user freeform notepad into clean categories and structured To Buy items.',
    '3) IMPORTANT: Do NOT merge, deduplicate, or drop repeated items from the notepad. If the user typed the same item multiple times, output every entry separately so the app popup can ask whether to replace, keep both, or cancel.',
    '4) Group items under sensible categories. Reuse exact existingCategories names whenever they match semantically; otherwise propose clean new categories with colors from: blue, emerald, amber, purple, rose, cyan, orange, pink.',
    '5) PRICE ESTIMATION (Shopee / Lazada / TikTok PH basis):',
    '   - If the user wrote an explicit price for an item, keep that exact price, set priceEstimated: false, and priceBasis: "User Specified".',
    '   - If the user did NOT write a price (or price is missing), ALWAYS provide a realistic estimated price in PHP (> 0) using Shopee PH, Lazada PH, or TikTok Shop PH as the price basis, set priceEstimated: true, and set priceBasis to e.g. "Shopee PH Est.", "Lazada PH Est.", "TikTok Shop PH Est.", or "Shopee / Lazada PH Est.".',
    '6) HIGH-RATED LINKS (High Stars, Good Reviews, Many Solds):',
    '   - If the market research / VERIFIED SEARCH LINKS contain a good product listing with high stars (4.7+★), good reviews, and many solds on Shopee, Lazada, or TikTok Shop, set shopOrLink to that EXACT verified URL (never invent, guess, or fabricate URLs!).',
    '   - Set shopLabel to a concise clickable label like "Shopee (4.9★ · 5k+ sold)", "Lazada Mall", or "TikTok Shop", and set ratingSummary to a brief rating/sold summary (e.g. "4.9★ · 5k+ sold · Shopee") if found.',
    '   - If the user already wrote a URL/shop name in the notepad, preserve it.',
    '   - If no verified URL was found for a top-rated listing, leave shopOrLink empty ("") and still include the Shopee/Lazada/TikTok price basis.',
    '7) Choose wallet/bank from availableWallets (default to Maya or GoTyme savings pockets rather than credit wallets unless specified), optional deadline (YYYY-MM-DD), and concise practical notes.',
    '8) Assign priorityRank (1 = highest urgency/quick-win affordable item that fits debt-free savings pace, higher numbers = save later).',
    '9) Only suggest syncToFixed: true for high-priority practical items whose combined weekly savings fit comfortably inside estimatedSafeWeeklySurplusForToBuy.',
  ].join('\n');

  const prompt = [
    'FINANCIAL CONTEXT:',
    buildFinancialBrief(ctx),
    '',
    scenarioNote ? `USER SCENARIO NOTE:\n${scenarioNote}\n` : '',
    marketResearchText
      ? `MARKET RESEARCH FINDINGS (Shopee PH / Lazada PH / TikTok Shop PH):\n${marketResearchText}\n`
      : '',
    verifiedLinks.length > 0
      ? `VERIFIED SEARCH LINKS (Use ONLY exact URIs from this list or user input for shopOrLink):\n${JSON.stringify(verifiedLinks, null, 2)}\n`
      : 'VERIFIED SEARCH LINKS: None returned (do NOT fabricate URLs; leave shopOrLink empty unless user typed a link).\n',
    'USER NOTEPAD INPUT TO PARSE INTO CATEGORIES & ITEMS:',
    notepadText,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: 'Concise 1-2 sentence summary of parsed items, Shopee/Lazada/TikTok price estimates, and debt-free guidance.',
          },
          categoriesToCreate: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                color: { type: Type.STRING },
              },
              required: ['name', 'color'],
            },
          },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                categoryName: { type: Type.STRING },
                price: { type: Type.NUMBER },
                priceEstimated: { type: Type.BOOLEAN },
                priceBasis: { type: Type.STRING },
                bank: { type: Type.STRING },
                deadline: { type: Type.STRING },
                shopOrLink: { type: Type.STRING },
                shopLabel: { type: Type.STRING },
                ratingSummary: { type: Type.STRING },
                note: { type: Type.STRING },
                priorityRank: { type: Type.INTEGER },
                syncToFixed: { type: Type.BOOLEAN },
              },
              required: [
                'title',
                'categoryName',
                'price',
                'priceEstimated',
                'priceBasis',
                'bank',
                'priorityRank',
                'syncToFixed',
              ],
            },
          },
        },
        required: ['summary', 'categoriesToCreate', 'items'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    summary?: string;
    categoriesToCreate?: Array<{ name?: string; color?: string }>;
    items?: Array<Record<string, unknown>>;
  };

  const validColors = new Set<string>(ALLOWED_CATEGORY_COLORS);
  const categoriesToCreate = (parsed.categoriesToCreate || [])
    .slice(0, 30)
    .map((c) => ({
      name: clampString(c.name, 60),
      color: validColors.has(String(c.color || '').toLowerCase())
        ? String(c.color).toLowerCase()
        : 'blue',
    }))
    .filter((c) => c.name.length > 0);

  const verifiedUriSet = new Set(verifiedLinks.map((l) => l.uri));

  const items = (parsed.items || [])
    .slice(0, 120)
    .map((item, idx) => {
      const deadlineRaw = clampString(item.deadline, 20);
      const validDeadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw) ? deadlineRaw : '';
      const rawBank = clampString(item.bank, 40);
      const matchedBank =
        ctx.banks.find((b) => b.toLowerCase() === rawBank.toLowerCase()) || ctx.banks[0] || 'Maya';
      const rawShop = clampString(item.shopOrLink, 500);
      const isHttpUrl = /^https?:\/\//i.test(rawShop);
      // Allow user-written URLs (present in notepadText) or verified grounding URLs; discard unverified hallucinated URLs
      const safeShopOrLink = isHttpUrl
        ? verifiedUriSet.has(rawShop) || notepadText.includes(rawShop)
          ? rawShop
          : ''
        : rawShop;

      return {
        title: clampString(item.title, 100),
        categoryName: clampString(item.categoryName, 60) || 'General',
        price: clampNumber(item.price),
        priceEstimated: Boolean(item.priceEstimated),
        priceBasis: clampString(item.priceBasis, 60) || (item.priceEstimated ? 'Shopee / Lazada PH Est.' : 'User Specified'),
        bank: matchedBank,
        deadline: validDeadline,
        shopOrLink: safeShopOrLink,
        shopLabel: clampString(item.shopLabel, 80),
        ratingSummary: clampString(item.ratingSummary, 90),
        note: clampString(item.note, 220),
        priorityRank: Math.max(1, Math.round(clampNumber(item.priorityRank ?? idx + 1, 1, 999))),
        syncToFixed: Boolean(item.syncToFixed),
      };
    })
    .filter((i) => i.title.length > 0);

  return {
    mode: 'notepad',
    summary: clampString(parsed.summary, 400) || `Parsed ${items.length} item(s) from your notepad.`,
    categoriesToCreate,
    items,
  };
}

async function handlePlanRequest(
  ai: GoogleGenAI,
  scenarioNote: string,
  ctx: ToBuyAiContext
) {
  const pendingItems = ctx.toBuyItems.filter((i) => !i.checked);
  if (pendingItems.length === 0) {
    return {
      mode: 'plan',
      strategySummary: 'Your To Buy list is currently empty. Add items using the AI Notepad or Add Item button first.',
      safeWeeklyToBuyBudget: 0,
      debtFreeReminder: 'Keep prioritizing active debt payments first while building your save-before-buying queue.',
      itemActions: [],
    };
  }

  const systemInstruction = [
    'You are the Von Allocator Debt-Free Purchase Strategist.',
    'Rules:',
    '1) DEBT-FREE FIRST: Active SPaylater/SLoan payments are Priority #1. Never recommend spending money needed for debts or essential fixed/variable food expenses.',
    '2) SAVE BEFORE BUYING: Every To Buy item must be 100% funded via weekly savings allocations before checkout (never on credit).',
    '3) BUY FASTER & PRACTICALLY: Sequence pending items using quick-win / high-utility ordering (essential/cheap quick wins or urgent deadlines first) and stagger deadlines (YYYY-MM-DD starting from todayISO or later) so the combined weekly savings of items with syncToFixed=true stays within safeWeeklyToBuyBudget.',
    '4) Use ONLY existing item ids from currentToBuyItems and banks from availableWallets (prefer Maya/GoTyme/CIMB savings wallets rather than credit wallets).',
    '5) Keep explanations crisp, numerical (PHP ₱), and practical.',
  ].join('\n');

  const prompt = [
    'FINANCIAL CONTEXT:',
    buildFinancialBrief(ctx),
    '',
    'USER SCENARIO / QUESTION:',
    scenarioNote || 'Help me buy all listed To Buy items as fast as practically possible while staying debt-free and saving 100% before buying.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          strategySummary: {
            type: Type.STRING,
            description: 'Practical 2-3 sentence financial plan explaining how to allocate funds and reach debt-free faster.',
          },
          safeWeeklyToBuyBudget: {
            type: Type.NUMBER,
            description: 'Recommended maximum weekly PHP budget safe to allocate to To Buy items after debts & essentials.',
          },
          debtFreeReminder: {
            type: Type.STRING,
            description: '1 crisp sentence validating debt protection and save-before-buying status.',
          },
          itemActions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                itemId: { type: Type.STRING },
                priorityOrder: { type: Type.INTEGER },
                recommendedDeadline: { type: Type.STRING },
                recommendedBank: { type: Type.STRING },
                syncToFixed: { type: Type.BOOLEAN },
                actionReason: { type: Type.STRING },
                noteUpdate: { type: Type.STRING },
              },
              required: [
                'itemId',
                'priorityOrder',
                'recommendedDeadline',
                'recommendedBank',
                'syncToFixed',
                'actionReason',
              ],
            },
          },
        },
        required: ['strategySummary', 'safeWeeklyToBuyBudget', 'debtFreeReminder', 'itemActions'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    strategySummary?: string;
    safeWeeklyToBuyBudget?: number;
    debtFreeReminder?: string;
    itemActions?: Array<Record<string, unknown>>;
  };

  const validItemIds = new Set(pendingItems.map((i) => i.id));
  const itemActions = (parsed.itemActions || [])
    .slice(0, 150)
    .filter((a) => validItemIds.has(clampString(a.itemId, 64)))
    .map((a, idx) => {
      const deadlineRaw = clampString(a.recommendedDeadline, 20);
      const validDeadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineRaw) ? deadlineRaw : '';
      const rawBank = clampString(a.recommendedBank, 40);
      const matchedBank =
        ctx.banks.find((b) => b.toLowerCase() === rawBank.toLowerCase()) || ctx.banks[0] || 'Maya';
      return {
        itemId: clampString(a.itemId, 64),
        priorityOrder: Math.max(1, Math.round(clampNumber(a.priorityOrder ?? idx + 1, 1, 999))),
        recommendedDeadline: validDeadline,
        recommendedBank: matchedBank,
        syncToFixed: Boolean(a.syncToFixed),
        actionReason: clampString(a.actionReason, 180),
        noteUpdate: clampString(a.noteUpdate, 120),
      };
    });

  return {
    mode: 'plan',
    strategySummary: clampString(parsed.strategySummary, 600),
    safeWeeklyToBuyBudget: clampNumber(parsed.safeWeeklyToBuyBudget),
    debtFreeReminder: clampString(parsed.debtFreeReminder, 240),
    itemActions,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  app.use('/api', (_req: Request, res: Response, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'von-allocator-ai' });
  });

  app.post('/api/tobuy-ai', async (req: Request, res: Response) => {
    try {
      const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
      const action = body.action === 'notepad' ? 'notepad' : body.action === 'plan' ? 'plan' : null;
      if (!action) {
        res.status(400).json({ error: 'Invalid AI action. Expected "notepad" or "plan".' });
        return;
      }

      const notepadText = clampString(body.notepadText, 8000);
      const scenarioNote = clampString(body.scenarioNote, 1200);
      const context = sanitizeContext(body.context);

      if (action === 'notepad' && !notepadText) {
        res.status(400).json({ error: 'Please type or paste your items in the AI Notepad first.' });
        return;
      }

      const ai = createGeminiClient();
      const result =
        action === 'notepad'
          ? await handleNotepadRequest(ai, notepadText, scenarioNote, context)
          : await handlePlanRequest(ai, scenarioNote, context);

      res.json(result);
    } catch (err) {
      const errorObj = err as Error & { status?: number; statusCode?: number };
      const status = errorObj.statusCode || errorObj.status || 500;
      const msg = errorObj.message || 'Failed to process To Buy AI request.';
      console.error('ToBuy AI API error:', msg);

      if (status === 403 || status === 400 || msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error: 'Gemini API key permission or validation failed. Check your API key in Settings > Secrets.',
        });
        return;
      }
      if (status === 429 || msg.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Gemini rate limit reached. Please wait a moment and try again.',
        });
        return;
      }
      res.status(status >= 400 && status < 600 ? status : 500).json({ error: msg });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
