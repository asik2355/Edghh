import express from 'express';
import { bot } from './src/bot';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.get('/', (req, res) => {
  res.send('Telegram Bot is running!');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function startApp() {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Web server running on http://localhost:${PORT}`);
  });

  try {
    console.log('Starting Telegram Bot...');
    await bot.launch();
    console.log('Bot launched successfully!');
  } catch (error) {
    console.error('Error starting bot:', error);
  }
}

startApp();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
