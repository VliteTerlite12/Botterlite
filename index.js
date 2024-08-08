const {
  makeWASocket,
  useMultiFileAuthState,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const { createSticker, StickerTypes } = require('wa-sticker-formatter');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ytdl = require('ytdl-core');
const FormData = require('form-data');
const Jimp = require('jimp');
const { exec } = require('child_process');

async function connectWhatsapp() {
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const socket = makeWASocket({
    printQRInTerminal: true,
    browser: ['DD', '', ''],
    auth: state,
    logger: pino({ level: 'silent' }),
  });

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('connection.update', async ({ connection }) => {
    if (connection === 'open') {
      console.log('Happy Boating'); //memberitahu jika sudah connect
    } else if (connection === 'close') {
      console.log('Bot tidak aktif, mencoba restart...');
      await sendNotification();
      await connectWhatsapp(); //gunanya buat connect ulang
    }
  });

  socket.ev.on('messages.upsert', async ({ messages, type }) => {
    const chat = messages[0];
    const pesan = (
      chat.message?.extendedTextMessage?.text ??
      chat.message?.ephemeralMessage?.message?.extendedTextMessage?.text ??
      chat.message?.conversation
    )?.toLowerCase() || '';
    const command = pesan.split(' ')[0];
    const args = pesan.split(' ').slice(1);

    switch (command) {
      case '.ping':
        await socket.sendMessage(chat.key.remoteJid, { text: 'Hello World.' }, { quoted: chat });
        await socket.sendMessage(chat.key.remoteJid, { text: 'Hello World2.' }); //buat tanpa quoted
        break;

      case '.h':
      case '.hidetag':
        if (!chat.key.remoteJid.includes('@g.us')) {
          await socket.sendMessage(chat.key.remoteJid, { text: '*Use in the group, no private chat!!*' }, { quoted: chat });
          return;
        }

        const metadata = await socket.groupMetadata(chat.key.remoteJid);
        const participants = metadata.participants.map((v) => v.id);

        socket.sendMessage(chat.key.remoteJid, {
          text: args.join(' '),
          mentions: participants,
        });

        break;

      case '.menu':
        await socket.sendMessage(chat.key.remoteJid, {
          text: `*Menu Bot*
1. .ping - Check the bot is active or not
2. .h / .hidetag - Send messages without tags
3. .sticker - Create stickers from images
4. .graph <url> - Download and send files from telegra.ph •beta version
5. .gitdown <url> - Download files from GitHub
6. .infopanel - Info Panel
7. .translate <text> <destination_language> - Translate text
`,
        }, { quoted: chat });
        break;

      case '.downgit':
        let url = args.join(' ');
        if (!url) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Please provide a GitHub repository URL to download.`,
          }, { quoted: chat });
          break;
        }
        if (!url.startsWith('https://github.com/')) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Invalid GitHub repository URL. Please provide a URL in the format https://github.com/username/repository.`,
          }, { quoted: chat });
          break;
        }
        try {
          let repoUrl = new URL(url);
          let repoOwner = repoUrl.pathname.split('/')[1];
          let repoName = repoUrl.pathname.split('/')[2];
          let zipUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/zipball/master`;
          let response = await axios({
            url: zipUrl,
            method: 'GET',
            responseType: 'arraybuffer',
            headers: {
              'Accept': 'application/zip',
              'User-Agent': 'WhatsApp Bot'
            }
          });
          let zipBuffer = response.data;
          let filename = `${repoName}.zip`;
          await socket.sendMessage(chat.key.remoteJid, {
            document: zipBuffer,
            filename: filename,
            mimetype: 'application/zip'
          }, { quoted: chat });
        } catch (error) {
          console.error("Error downloading repository:", error);
          await socket.sendMessage(chat.key.remoteJid, {
            text: `An error occurred while downloading the repository.`,
          }, { quoted: chat });
        }
        break;

      case '.buatgrup':
        let groupName = args.join(' ');
        if (!groupName) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Please provide a group name.`,
          }, { quoted: chat });
          break;
        }
        try {
          let group = await socket.groupCreate(groupName);
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Grup '${groupName}' sudah di buat, ini link grupnya: ${group.groupInviteUrl}`,
          }, { quoted: chat });
        } catch (error) {
          console.error("Error creating group:", error);
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Failed to create group. Please try again.`,
          }, { quoted: chat });
        }
        break;

      case '.translate':
        if (!args[0] || !args[1]) {
          await socket.sendMessage(chat.key.remoteJid, { text: 'Masukkan teks dan bahasa tujuan' }, { quoted: chat });
          return;
        }

        try {
          const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${args[1]}&dt=t&q=${encodeURIComponent(args.slice(0, -1).join(' '))}`);
          const data = await response.json();
          const translatedText = data[0][0][0];
          await socket.sendMessage(chat.key.remoteJid, { text: `*Terjemahan:*\n${translatedText}` }, { quoted: chat });
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, { text: 'Gagal menerjemahkan teks' }, { quoted: chat });
        }
        break;

      case '.graph':
        const url = pesan.split(' ')[1];
        if (!url) {
          await socket.sendMessage(chat.key.remoteJid, { text: 'Masukkan url telegraph' }, { quoted: chat });
          return;
        }
        try {
          const response = await axios.get(url);
          const buffer = Buffer.from(response.data, 'binary');
          await socket.sendMessage(chat.key.remoteJid, { document: buffer, fileName: 'file', mimetype: 'application/octet-stream' }, { quoted: chat });
        } catch (error) {
          await socket.sendMessage(chat.key.remoteJid, { text: 'Gagal mengunduh file' }, { quoted: chat });
        }
        break;

      case '.terminal':
        const command = pesan.split(' ').slice(1).join(' ');
        try {
          exec(command, (error, stdout, stderr) => {
            if (error) {
              console.error(`exec error: ${error}`);
              socket.sendMessage(chat.key.remoteJid, { text: `Terjadi kesalahan: ${error.message}` }, { quoted: chat });
              return;
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            socket.sendMessage(chat.key.remoteJid, { text: `Output:\n${stdout}` }, { quoted: chat });
          });
        } catch (error) {
          console.error(`exec error: ${error}`);
          socket.sendMessage(chat.key.remoteJid, { text: `Terjadi kesalahan: ${error.message}` }, { quoted: chat });
        }
        break;

      case '.ai':
      case 'ai':
      case 'help':
        let prompt = args.join(' ');
        if (!prompt) {
          await socket.sendMessage(chat.key.remoteJid, {
            text: `Please provide a prompt or question for the AI.`,
          }, { quoted: chat });
          break;
        }
        try {
          let response = await axios({
            url: "https://elxyz.me/api/chat",
            method: 'POST',
            data: new URLSearchParams({
              prompt: prompt,
              sessionId: '-',
              character: `Kamu adalah seorang developer handal, kamu sangat ahli dalam membuat kode dan memecahkan masalah. Kamu memiliki sifat yang sangat sabar dan teliti, kamu juga sangat suka membantu orang lain dalam memecahkan masalah mereka.`
            }),
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });
          let aiResponse = response.data;
          await socket.sendMessage(chat.key.remoteJid, {
            text: aiResponse,
          }, { quoted: chat });
        } catch (error) {
          console.error("Error during AI request:", error);
          await socket.sendMessage(chat.key.remoteJid, {
            text: `An error occurred during the AI process.`,
          }, { quoted: chat });
        }
        break;

      case '.sticker':
        if (chat.message?.imageMessage?.caption == '.sticker' && chat.message?.imageMessage) {
          const getMedia = async (msg) => {
            const messageType = Object.keys(msg?.message)[0];
            const stream = await downloadContentFromMessage(msg.message[messageType], messageType.replace('Message', ''));
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            return buffer;
          };

          const mediaData = await getMedia(chat);
          const stickerOption = {
            pack: 'MTSBot Stiker',
            author: 'Kelas 8F',
            type: StickerTypes.FULL,
            quality: 100,
          };

          const generateSticker = await createSticker(mediaData, stickerOption);
          await socket.sendMessage(chat.key.remoteJid, { sticker: generateSticker }); //langsung cobaaa
        }
        break;
    }
  });
}

async function sendNotification() {
  const socket = makeWASocket({
    printQRInTerminal: true,
    browser: ['DD', '', ''],
    logger: pino({ level: 'silent' }),
  });
  await socket.sendMessage('6283116847160@c.us', 'Bot WhatsApp Anda berhenti!');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

connectWhatsapp()
