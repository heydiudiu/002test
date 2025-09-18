const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, config.dataFileName);

const defaultStore = {
  users: [],
  tasks: [],
  ideas: [],
  profits: [],
  inbox: [],
  reviews: []
};

let store = JSON.parse(JSON.stringify(defaultStore));
let writeQueue = Promise.resolve();

function ensureDataDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  }
}

function deriveKey(secret) {
  return crypto.scryptSync(secret, 'daily-ops-v1', 32);
}

function decryptPayload(buffer) {
  if (!config.appSecret) {
    return buffer.toString('utf8');
  }

  const text = buffer.toString('utf8');
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    // File is stored without encryption even though a secret is provided.
    // As a fallback try to treat it as plaintext JSON.
    return text;
  }

  if (!payload || !payload.iv || !payload.tag || !payload.data) {
    throw new Error('Invalid encrypted data payload.');
  }

  try {
    const key = deriveKey(config.appSecret);
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const encrypted = Buffer.from(payload.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error('Unable to decrypt data file. Verify APP_SECRET is correct.');
  }
}

function encryptPayload(jsonString) {
  if (!config.appSecret) {
    return jsonString;
  }

  const key = deriveKey(config.appSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(jsonString, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    version: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
  return JSON.stringify(payload);
}

async function persist() {
  const jsonString = JSON.stringify(store, null, 2);
  const payload = encryptPayload(jsonString);

  writeQueue = writeQueue
    .then(() => fs.promises.writeFile(dataFile, payload, { mode: 0o600 }))
    .catch((error) => {
      console.error('Failed to persist planner data:', error);
      throw error;
    });
  return writeQueue;
}

async function init() {
  ensureDataDirectory();
  if (!fs.existsSync(dataFile)) {
    store = JSON.parse(JSON.stringify(defaultStore));
    await persist();
    return;
  }

  const buffer = await fs.promises.readFile(dataFile);
  if (!buffer || buffer.length === 0) {
    store = JSON.parse(JSON.stringify(defaultStore));
    await persist();
    return;
  }

  const jsonText = decryptPayload(buffer);
  try {
    store = JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse data store. Resetting to defaults to prevent data loss.');
    store = JSON.parse(JSON.stringify(defaultStore));
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function findIndexById(collection, id) {
  return collection.findIndex((item) => item.id === id);
}

// User operations
function getUserByUsername(username) {
  return store.users.find((user) => user.username === username);
}

function getUserById(userId) {
  return store.users.find((user) => user.id === userId);
}

async function addUser(user) {
  store.users.push(user);
  await persist();
  return user;
}

// Task operations
function listTasks() {
  return clone(store.tasks);
}

async function addTask(task) {
  store.tasks.push(task);
  await persist();
  return task;
}

async function updateTask(id, updates) {
  const index = findIndexById(store.tasks, id);
  if (index === -1) {
    return null;
  }
  const existing = store.tasks[index];
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  store.tasks[index] = updated;
  await persist();
  return updated;
}

async function removeTask(id) {
  const index = findIndexById(store.tasks, id);
  if (index === -1) {
    return false;
  }
  store.tasks.splice(index, 1);
  await persist();
  return true;
}

// Idea operations
function listIdeas() {
  return clone(store.ideas);
}

async function addIdea(idea) {
  store.ideas.push(idea);
  await persist();
  return idea;
}

async function updateIdea(id, updates) {
  const index = findIndexById(store.ideas, id);
  if (index === -1) {
    return null;
  }
  const existing = store.ideas[index];
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  store.ideas[index] = updated;
  await persist();
  return updated;
}

async function removeIdea(id) {
  const index = findIndexById(store.ideas, id);
  if (index === -1) {
    return false;
  }
  store.ideas.splice(index, 1);
  await persist();
  return true;
}

// Profit operations
function listProfits() {
  return clone(store.profits);
}

async function addProfit(entry) {
  store.profits.push(entry);
  await persist();
  return entry;
}

async function updateProfit(id, updates) {
  const index = findIndexById(store.profits, id);
  if (index === -1) {
    return null;
  }
  const existing = store.profits[index];
  const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
  store.profits[index] = updated;
  await persist();
  return updated;
}

async function removeProfit(id) {
  const index = findIndexById(store.profits, id);
  if (index === -1) {
    return false;
  }
  store.profits.splice(index, 1);
  await persist();
  return true;
}

// Inbox operations
function listInbox() {
  return clone(store.inbox);
}

async function addInboxEntry(entry) {
  store.inbox.push(entry);
  await persist();
  return entry;
}

async function removeInboxEntry(id) {
  const index = findIndexById(store.inbox, id);
  if (index === -1) {
    return false;
  }
  store.inbox.splice(index, 1);
  await persist();
  return true;
}

// Daily review operations
function listReviews() {
  return clone(store.reviews);
}

async function upsertReview(review) {
  const index = store.reviews.findIndex((item) => item.date === review.date);
  if (index === -1) {
    store.reviews.push(review);
  } else {
    store.reviews[index] = { ...store.reviews[index], ...review, updatedAt: new Date().toISOString() };
  }
  await persist();
  return review;
}

function getSnapshot() {
  return clone(store);
}

module.exports = {
  init,
  getUserByUsername,
  getUserById,
  addUser,
  listTasks,
  addTask,
  updateTask,
  removeTask,
  listIdeas,
  addIdea,
  updateIdea,
  removeIdea,
  listProfits,
  addProfit,
  updateProfit,
  removeProfit,
  listInbox,
  addInboxEntry,
  removeInboxEntry,
  listReviews,
  upsertReview,
  getSnapshot
};
