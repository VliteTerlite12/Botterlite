#!/bin/bash

# Install dependencies
echo "Installing dependencies..."
yarn add @whiskeysockets/baileys pino wa-sticker-formatter axios ytdl-core form-data jimp
npm install

# Run the bot
echo "Starting the bot..."
node bot.j
