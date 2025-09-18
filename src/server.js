const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const storage = require('./storage');
const config = require('./config');
const {
  sendJson,
  sendText,
  parseJsonBody,
  applySecurityHeaders
} = require('./httpUtils');

const STATIC_DIR = path.join(__dirname, '..', 'public');

function normalizeDate(input) {
  if (!input) {
    return null;
  }
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function categorizeTasks(tasks, today) {
  const todayDate = today;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const todayTasks = [];
  const tomorrowTasks = [];
  const upcoming = [];
  const overdue = [];

  for (const task of tasks) {
    if (task.status === 'done') {
      continue;
    }
    if (!task.dueDate) {
      upcoming.push(task);
      continue;
    }
    if (task.dueDate === todayDate) {
      todayTasks.push(task);
    } else if (task.dueDate === tomorrowStr) {
      tomorrowTasks.push(task);
    } else if (task.dueDate < todayDate) {
      overdue.push(task);
    } else {
      upcoming.push(task);
    }
  }

  return {
    todayTasks,
    tomorrowTasks,
    upcoming,
    overdue
  };
}

function calculateProfitMetrics(profits, today) {
  const todayStart = new Date(today);
  const todayStr = todayStart.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(todayStart.getDate() - 6);
  const thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(todayStart.getDate() - 29);

  let todayTotal = 0;
  let sevenDayTotal = 0;
  let thirtyDayTotal = 0;

  for (const entry of profits) {
    const date = entry.date;
    if (!date) {
      continue;
    }
    if (date === todayStr) {
      todayTotal += Number(entry.amount) || 0;
    }
    if (date >= sevenDaysAgo.toISOString().slice(0, 10) && date <= todayStr) {
      sevenDayTotal += Number(entry.amount) || 0;
    }
    if (date >= thirtyDaysAgo.toISOString().slice(0, 10) && date <= todayStr) {
      thirtyDayTotal += Number(entry.amount) || 0;
    }
  }

  return {
    todayTotal,
    sevenDayTotal,
    thirtyDayTotal
  };
}

function getTopPriorityTasks(tasks) {
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  return tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => {
      const priorityDiff = (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    })
    .slice(0, 3);
}

async function handleDashboard(req, res) {
  const snapshot = storage.getSnapshot();
  const today = new Date().toISOString().slice(0, 10);
  const tasks = snapshot.tasks || [];
  const profits = snapshot.profits || [];
  const ideas = snapshot.ideas || [];
  const inbox = snapshot.inbox || [];

  const taskBuckets = categorizeTasks(tasks, today);
  const profitStats = calculateProfitMetrics(profits, today);
  const topPriorities = getTopPriorityTasks(tasks);

  sendJson(res, 200, {
    today,
    tasks: {
      ...taskBuckets,
      total: tasks.length,
      completedToday: tasks.filter((task) => task.dueDate === today && task.status === 'done').length
    },
    profits: {
      entries: profits.length,
      ...profitStats
    },
    ideas: {
      total: ideas.length,
      incubating: ideas.filter((idea) => idea.status !== 'archived').length
    },
    inbox: {
      total: inbox.length
    },
    focus: topPriorities
  });
}

async function handleGetTasks(req, res, url) {
  const tasks = storage.listTasks();
  const statusFilter = url.searchParams.get('status');
  const dateFilter = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  let result = tasks;

  if (statusFilter) {
    result = result.filter((task) => task.status === statusFilter);
  }
  if (dateFilter) {
    result = result.filter((task) => task.dueDate === dateFilter);
  }
  if (from) {
    result = result.filter((task) => !task.dueDate || task.dueDate >= from);
  }
  if (to) {
    result = result.filter((task) => !task.dueDate || task.dueDate <= to);
  }

  result = result.sort((a, b) => {
    if (a.dueDate && b.dueDate) {
      const cmp = a.dueDate.localeCompare(b.dueDate);
      if (cmp !== 0) {
        return cmp;
      }
    }
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  sendJson(res, 200, { tasks: result });
}

async function handleCreateTask(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const title = body?.title?.trim();
  if (!title) {
    sendJson(res, 400, { error: '任务标题不能为空。' });
    return;
  }

  const dueDate = normalizeDate(body?.dueDate);
  const task = {
    id: crypto.randomUUID(),
    title,
    description: body?.description?.trim() || '',
    dueDate,
    status: body?.status || 'pending',
    priority: body?.priority || 'medium',
    category: body?.category?.trim() || 'general',
    tags: Array.isArray(body?.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : typeof body?.tags === 'string'
      ? body.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    estimatedMinutes: Number(body?.estimatedMinutes) > 0 ? Number(body.estimatedMinutes) : null,
    checklist: Array.isArray(body?.checklist) ? body.checklist : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await storage.addTask(task);
  sendJson(res, 201, { task });
}

async function handleUpdateTask(req, res, taskId) {
  const tasks = storage.listTasks();
  if (!tasks.find((task) => task.id === taskId)) {
    sendJson(res, 404, { error: '任务不存在。' });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const updates = {};
  if (typeof body?.title === 'string') {
    updates.title = body.title.trim();
  }
  if (typeof body?.description === 'string') {
    updates.description = body.description.trim();
  }
  if (typeof body?.status === 'string') {
    updates.status = body.status;
  }
  if (typeof body?.priority === 'string') {
    updates.priority = body.priority;
  }
  if (typeof body?.category === 'string') {
    updates.category = body.category.trim();
  }
  if (typeof body?.dueDate !== 'undefined') {
    const normalized = normalizeDate(body.dueDate);
    if (!normalized && body.dueDate) {
      sendJson(res, 400, { error: '日期格式无效。' });
      return;
    }
    updates.dueDate = normalized;
  }
  if (Array.isArray(body?.tags)) {
    updates.tags = body.tags.map((tag) => String(tag).trim()).filter(Boolean);
  } else if (typeof body?.tags === 'string') {
    updates.tags = body.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (typeof body?.estimatedMinutes !== 'undefined') {
    const numberValue = Number(body.estimatedMinutes);
    updates.estimatedMinutes = Number.isNaN(numberValue) ? null : numberValue;
  }
  if (Array.isArray(body?.checklist)) {
    updates.checklist = body.checklist;
  }
  if (typeof body?.note === 'string') {
    updates.note = body.note.trim();
  }

  const updated = await storage.updateTask(taskId, updates);
  sendJson(res, 200, { task: updated });
}

async function handleDeleteTask(req, res, taskId) {
  const tasks = storage.listTasks();
  if (!tasks.find((task) => task.id === taskId)) {
    sendJson(res, 404, { error: '任务不存在。' });
    return;
  }
  await storage.removeTask(taskId);
  sendText(res, 204, '');
}

async function handleGetIdeas(req, res) {
  const ideas = storage
    .listIdeas()
    .sort(
      (a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );
  sendJson(res, 200, { ideas });
}

async function handleCreateIdea(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const title = body?.title?.trim();
  if (!title) {
    sendJson(res, 400, { error: '想法标题不能为空。' });
    return;
  }

  const idea = {
    id: crypto.randomUUID(),
    title,
    detail: body?.detail?.trim() || '',
    tags: Array.isArray(body?.tags)
      ? body.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : typeof body?.tags === 'string'
      ? body.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [],
    status: body?.status || 'incubating',
    impact: Number(body?.impact) || null,
    confidence: Number(body?.confidence) || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await storage.addIdea(idea);
  sendJson(res, 201, { idea });
}

async function handleUpdateIdea(req, res, ideaId) {
  const ideas = storage.listIdeas();
  if (!ideas.find((idea) => idea.id === ideaId)) {
    sendJson(res, 404, { error: '想法不存在。' });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const updates = {};
  if (typeof body?.title === 'string') {
    updates.title = body.title.trim();
  }
  if (typeof body?.detail === 'string') {
    updates.detail = body.detail.trim();
  }
  if (typeof body?.status === 'string') {
    updates.status = body.status;
  }
  if (Array.isArray(body?.tags)) {
    updates.tags = body.tags.map((tag) => String(tag).trim()).filter(Boolean);
  } else if (typeof body?.tags === 'string') {
    updates.tags = body.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (typeof body?.impact !== 'undefined') {
    updates.impact = Number(body.impact) || null;
  }
  if (typeof body?.confidence !== 'undefined') {
    updates.confidence = Number(body.confidence) || null;
  }

  const updated = await storage.updateIdea(ideaId, updates);
  sendJson(res, 200, { idea: updated });
}

async function handleDeleteIdea(req, res, ideaId) {
  const ideas = storage.listIdeas();
  if (!ideas.find((idea) => idea.id === ideaId)) {
    sendJson(res, 404, { error: '想法不存在。' });
    return;
  }
  await storage.removeIdea(ideaId);
  sendText(res, 204, '');
}

async function handleGetProfits(req, res, url) {
  let profits = storage.listProfits();
  const start = url.searchParams.get('start');
  const end = url.searchParams.get('end');
  const chain = url.searchParams.get('chain');

  if (start) {
    profits = profits.filter((entry) => entry.date && entry.date >= start);
  }
  if (end) {
    profits = profits.filter((entry) => entry.date && entry.date <= end);
  }
  if (chain) {
    profits = profits.filter((entry) => entry.chain === chain);
  }

  profits.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  sendJson(res, 200, { profits });
}

async function handleCreateProfit(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const date = normalizeDate(body?.date) || new Date().toISOString().slice(0, 10);
  const amount = Number(body?.amount);
  if (Number.isNaN(amount)) {
    sendJson(res, 400, { error: '请提供有效的收益金额。' });
    return;
  }

  const entry = {
    id: crypto.randomUUID(),
    date,
    amount,
    currency: body?.currency?.trim() || 'USDT',
    market: body?.market?.trim() || '',
    chain: body?.chain?.trim() || '',
    txHash: body?.txHash?.trim() || '',
    notes: body?.notes?.trim() || '',
    strategy: body?.strategy?.trim() || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await storage.addProfit(entry);
  sendJson(res, 201, { profit: entry });
}

async function handleUpdateProfit(req, res, profitId) {
  const profits = storage.listProfits();
  if (!profits.find((entry) => entry.id === profitId)) {
    sendJson(res, 404, { error: '收益记录不存在。' });
    return;
  }

  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const updates = {};
  if (typeof body?.date !== 'undefined') {
    const normalized = normalizeDate(body.date);
    if (!normalized && body.date) {
      sendJson(res, 400, { error: '日期格式无效。' });
      return;
    }
    updates.date = normalized;
  }
  if (typeof body?.amount !== 'undefined') {
    const amount = Number(body.amount);
    if (Number.isNaN(amount)) {
      sendJson(res, 400, { error: '收益金额无效。' });
      return;
    }
    updates.amount = amount;
  }
  if (typeof body?.currency === 'string') {
    updates.currency = body.currency.trim();
  }
  if (typeof body?.market === 'string') {
    updates.market = body.market.trim();
  }
  if (typeof body?.chain === 'string') {
    updates.chain = body.chain.trim();
  }
  if (typeof body?.txHash === 'string') {
    updates.txHash = body.txHash.trim();
  }
  if (typeof body?.notes === 'string') {
    updates.notes = body.notes.trim();
  }
  if (typeof body?.strategy === 'string') {
    updates.strategy = body.strategy.trim();
  }

  const updated = await storage.updateProfit(profitId, updates);
  sendJson(res, 200, { profit: updated });
}

async function handleDeleteProfit(req, res, profitId) {
  const profits = storage.listProfits();
  if (!profits.find((entry) => entry.id === profitId)) {
    sendJson(res, 404, { error: '收益记录不存在。' });
    return;
  }
  await storage.removeProfit(profitId);
  sendText(res, 204, '');
}

async function handleGetInbox(req, res) {
  const inbox = storage
    .listInbox()
    .sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );
  sendJson(res, 200, { inbox });
}

async function handleCreateInbox(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }
  const content = body?.content?.trim();
  if (!content) {
    sendJson(res, 400, { error: '内容不能为空。' });
    return;
  }
  const entry = {
    id: crypto.randomUUID(),
    content,
    type: body?.type?.trim() || 'note',
    createdAt: new Date().toISOString()
  };
  await storage.addInboxEntry(entry);
  sendJson(res, 201, { entry });
}

async function handleDeleteInbox(req, res, inboxId) {
  const inbox = storage.listInbox();
  if (!inbox.find((entry) => entry.id === inboxId)) {
    sendJson(res, 404, { error: '记录不存在。' });
    return;
  }
  await storage.removeInboxEntry(inboxId);
  sendText(res, 204, '');
}

async function handleGetReviews(req, res, url) {
  const date = url.searchParams.get('date');
  const reviews = storage
    .listReviews()
    .filter((review) => (!date ? true : review.date === date))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  sendJson(res, 200, { reviews });
}

async function handleUpsertReview(req, res) {
  let body;
  try {
    body = await parseJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: error.message });
    return;
  }

  const date = normalizeDate(body?.date) || new Date().toISOString().slice(0, 10);
  const review = {
    date,
    highlight: body?.highlight?.trim() || '',
    lessons: body?.lessons?.trim() || '',
    blockers: body?.blockers?.trim() || '',
    mood: body?.mood?.trim() || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await storage.upsertReview(review);
  sendJson(res, 200, { review });
}

function serveStaticFile(req, res, url) {
  let requestedPath = url.pathname;
  if (requestedPath === '/') {
    requestedPath = '/index.html';
  }
  const safePath = path.normalize(requestedPath).replace(/^\/+/, '');
  const filePath = path.join(STATIC_DIR, safePath);

  if (!filePath.startsWith(STATIC_DIR)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const stream = fs.createReadStream(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg'
    };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    applySecurityHeaders(res);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-cache'
    });
    stream.pipe(res);
    stream.on('error', () => {
      res.destroy();
    });
  });
}

const routes = [
  { method: 'GET', pattern: /^\/api\/dashboard$/, handler: (req, res) => handleDashboard(req, res) },
  { method: 'GET', pattern: /^\/api\/tasks$/, handler: (req, res, ctx) => handleGetTasks(req, res, ctx.url) },
  { method: 'POST', pattern: /^\/api\/tasks$/, handler: (req, res) => handleCreateTask(req, res) },
  {
    method: 'PATCH',
    pattern: /^\/api\/tasks\/([^/]+)$/,
    handler: (req, res, ctx) => handleUpdateTask(req, res, ctx.params[0])
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/tasks\/([^/]+)$/,
    handler: (req, res, ctx) => handleDeleteTask(req, res, ctx.params[0])
  },
  { method: 'GET', pattern: /^\/api\/ideas$/, handler: (req, res) => handleGetIdeas(req, res) },
  { method: 'POST', pattern: /^\/api\/ideas$/, handler: (req, res) => handleCreateIdea(req, res) },
  {
    method: 'PATCH',
    pattern: /^\/api\/ideas\/([^/]+)$/,
    handler: (req, res, ctx) => handleUpdateIdea(req, res, ctx.params[0])
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/ideas\/([^/]+)$/,
    handler: (req, res, ctx) => handleDeleteIdea(req, res, ctx.params[0])
  },
  { method: 'GET', pattern: /^\/api\/profits$/, handler: (req, res, ctx) => handleGetProfits(req, res, ctx.url) },
  { method: 'POST', pattern: /^\/api\/profits$/, handler: (req, res) => handleCreateProfit(req, res) },
  {
    method: 'PATCH',
    pattern: /^\/api\/profits\/([^/]+)$/,
    handler: (req, res, ctx) => handleUpdateProfit(req, res, ctx.params[0])
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/profits\/([^/]+)$/,
    handler: (req, res, ctx) => handleDeleteProfit(req, res, ctx.params[0])
  },
  { method: 'GET', pattern: /^\/api\/inbox$/, handler: (req, res) => handleGetInbox(req, res) },
  { method: 'POST', pattern: /^\/api\/inbox$/, handler: (req, res) => handleCreateInbox(req, res) },
  {
    method: 'DELETE',
    pattern: /^\/api\/inbox\/([^/]+)$/,
    handler: (req, res, ctx) => handleDeleteInbox(req, res, ctx.params[0])
  },
  { method: 'GET', pattern: /^\/api\/reviews$/, handler: (req, res, ctx) => handleGetReviews(req, res, ctx.url) },
  { method: 'POST', pattern: /^\/api\/reviews$/, handler: (req, res) => handleUpsertReview(req, res) }
];

function findRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const match = pathname.match(route.pattern);
    if (match) {
      return { route, params: match.slice(1) };
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendText(res, 204, '', {
      'Access-Control-Allow-Origin': req.headers.origin || '',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS'
    });
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const match = findRoute(req.method, url.pathname);
    if (match) {
      await match.route.handler(req, res, { url, params: match.params });
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStaticFile(req, res, url);
      return;
    }

    sendJson(res, 404, { error: '未找到资源。' });
  } catch (error) {
    console.error('请求处理失败:', error);
    sendJson(res, 500, { error: '服务器内部错误。' });
  }
});

storage
  .init()
  .then(() => {
    server.listen(config.port, () => {
      console.log(`Daily planner server listening on port ${config.port}`);
    });
  })
  .catch((error) => {
    console.error('无法初始化数据存储：', error);
    process.exit(1);
  });
