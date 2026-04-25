import { Telegraf, Markup, session, Context } from 'telegraf';
import { db_helper } from './database';
import { nexaApi } from './nexaApi';

interface MyContext extends Context {
  session: {
    step?: string;
    tempName?: string;
    tempCountry?: string;
    tempRange?: string;
    lastServiceId?: number;
    lastMessageId?: number;
    broadcastType?: string;
    broadcastContent?: any;
  };
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '7735071779:AAFF5bSVFDgQJY31qkjW38XaVCewdgEtfR4';

export const bot = new Telegraf<MyContext>(BOT_TOKEN);

// Helper to send message or update existing one
const updateUI = async (ctx: MyContext, text: string, extra?: any) => {
  if (!ctx.session) ctx.session = {};
  
  const options = { parse_mode: 'HTML', ...extra };

  if (ctx.session.lastMessageId) {
    try {
      await ctx.telegram.editMessageText(ctx.chat!.id, ctx.session.lastMessageId, undefined, text, options);
      return;
    } catch (e) {
      // If edit fails (e.g. content same, or message deleted/too old), we send a new one
    }
  }
  
  const msg = await ctx.reply(text, options);
  ctx.session.lastMessageId = msg.message_id;
  return msg;
};

const sendAutoDeleteMedia = async (ctx: MyContext, type: string, fileId: string, extra?: any) => {
  if (ctx.session?.lastMessageId) {
    try {
      await ctx.deleteMessage(ctx.session.lastMessageId);
    } catch (e) { }
  }
  let msg;
  if (type === 'photo') msg = await ctx.replyWithPhoto(fileId, extra);
  else if (type === 'video') msg = await ctx.replyWithVideo(fileId, extra);
  else if (type === 'sticker') msg = await ctx.replyWithSticker(fileId, extra);
  else if (type === 'document') msg = await ctx.replyWithDocument(fileId, extra);
  else msg = await ctx.reply(fileId, extra);

  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = msg.message_id;
  return msg;
};

// Middleware
bot.use(session());

// Main Menu
const mainMenu = () => Markup.keyboard([
  ['📱 Get Number', '⚙️ Admin Panel']
]).resize();

// Admin Menus
const adminMenuMain = () => Markup.inlineKeyboard([
  [Markup.button.callback('🛠️ Manage Service', 'admin_manage_services')],
  [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
  [Markup.button.callback('⚙️ Group Settings', 'admin_manage_groups')],
  [Markup.button.callback('🔑 Set Nexa API Key', 'admin_manage_api')],
  [Markup.button.callback('💰 Balance', 'admin_check_balance')],
]);

const groupManageMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('🔗 Set OTP Group Link', 'admin_set_otp_link'), Markup.button.callback('🗑️ Delete', 'admin_delete_otp_link')],
  [Markup.button.callback('📊 Set Log Group ID', 'admin_set_log_group'), Markup.button.callback('🗑️ Delete', 'admin_delete_log_group')],
  [Markup.button.callback('⬅️ Back', 'admin_back_to_main')],
]);

const serviceManageMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('➕ Add Service', 'admin_add_service')],
  [Markup.button.callback('🗑️ Delete Service', 'admin_list_delete_service')],
  [Markup.button.callback('⬅️ Back', 'admin_back_to_main')],
]);

const apiManageMenu = () => Markup.inlineKeyboard([
  [Markup.button.callback('➕ Add/Update Key', 'admin_set_api_key')],
  [Markup.button.callback('🗑️ Delete Key', 'admin_delete_api_key')],
  [Markup.button.callback('⬅️ Back', 'admin_back_to_main')],
]);

// Start command
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  db_helper.addUser(userId);
  
  // Explicitly add the requested admin ID if it's the one starting
  if (userId === 8197284774 && !db_helper.isAdmin(userId)) {
    db_helper.addAdmin(userId);
    await ctx.reply('👑 Welcome Master! You are identified as the Bot Admin.');
  }

  await updateUI(ctx, '👋 Welcome to NexaOTP Bot! Please select an option:', mainMenu());
});

// Main menu handlers
bot.hears('📱 Get Number', async (ctx) => {
  const services = db_helper.getServices();
  if (services.length === 0) {
    return updateUI(ctx, '❌ Sorry, no services are available at the moment. Please ask the admin to add services.');
  }

  const buttons = services.map(s => [Markup.button.callback(`${s.name} (${s.country})`, `buy_${s.id}`)]);
  await updateUI(ctx, '🔍 Which service do you need a number for?', Markup.inlineKeyboard(buttons));
});

bot.hears('⚙️ Admin Panel', async (ctx) => {
  if (!db_helper.isAdmin(ctx.from.id)) {
    return updateUI(ctx, '❌ You are not an admin. Access denied.');
  }
  
  const userCount = db_helper.getUsersCount();
  const serviceCount = db_helper.getServicesCount();
  
  const text = [
    `👑 <b>ADMIN CONTROL PANEL</b> 👑`,
    `━━━━━━━━━━━━━`,
    ``,
    `📊 <b>DATABASE OVERVIEW</b>`,
    `─ ─ ─ ─ ─ ─ ─`,
    `  👤  Users       »  ${userCount}`,
    `  🔢  Range     »  ${serviceCount}`,
    ``,
    `━━━━━━━━━━━━━`,
  ].join('\n');

  await updateUI(ctx, text, adminMenuMain());
});

bot.action('admin_back_to_main', async (ctx) => {
  if (!db_helper.isAdmin(ctx.from!.id)) return ctx.answerCbQuery('❌ Access Denied.');
  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;

  const userCount = db_helper.getUsersCount();
  const serviceCount = db_helper.getServicesCount();
  
  const text = [
    `👑 <b>ADMIN CONTROL PANEL</b> 👑`,
    `━━━━━━━━━━━━━`,
    ``,
    `📊 <b>DATABASE OVERVIEW</b>`,
    `─ ─ ─ ─ ─ ─ ─`,
    `  👤  Users       »  ${userCount}`,
    `  🔢  Range     »  ${serviceCount}`,
    ``,
    `━━━━━━━━━━━━━`,
  ].join('\n');

  await updateUI(ctx, text, adminMenuMain());
});

bot.action('admin_manage_services', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;
  await updateUI(ctx, '🛠️ <b>Manage Services:</b>', serviceManageMenu());
});

bot.action('admin_manage_groups', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;
  await updateUI(ctx, '⚙️ <b>Group Settings:</b>\n\nConfigure the links and group IDs here.', groupManageMenu());
});

bot.action('admin_manage_api', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;
  await updateUI(ctx, '🔑 <b>Manage Nexa API Key:</b>', apiManageMenu());
});

bot.action('admin_set_otp_link', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.step = 'awaiting_otp_link';
  await ctx.reply('🔗 Please send the <b>Public Link</b> for the OTP Group (e.g., https://t.me/...):', { parse_mode: 'HTML' });
});

bot.action('admin_set_log_group', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.step = 'awaiting_log_group';
  await ctx.reply('📊 Please send the <b>Chat ID</b> of the Log Group (e.g., -100XXXX):', { parse_mode: 'HTML' });
});

bot.action('admin_delete_otp_link', async (ctx) => {
  db_helper.deleteSetting('otp_group_link');
  await ctx.answerCbQuery('🗑️ OTP Link deleted.');
  await updateUI(ctx, '✅ OTP Group Link has been removed.', groupManageMenu());
});

bot.action('admin_delete_log_group', async (ctx) => {
  db_helper.deleteSetting('log_group_id');
  await ctx.answerCbQuery('🗑️ Log Group ID deleted.');
  await updateUI(ctx, '✅ Log Group ID has been removed.', groupManageMenu());
});

// Buy number action
bot.action(/^buy_(\d+)$/, async (ctx) => {
  const serviceId = parseInt(ctx.match[1]);
  const services = db_helper.getServices();
  const service = services.find(s => s.id === serviceId);

  if (!service) return ctx.answerCbQuery('❌ Service not found.');

  if (!ctx.session) ctx.session = {};
  ctx.session.lastServiceId = serviceId;
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;

  await ctx.answerCbQuery('🔄 Requesting number...');
  await updateUI(ctx, `⌛ Searching for a number for <b>${service.name}</b>...`);

  const result = await nexaApi.requestNumber(service.range_code);

  if (result && result.success) {
    const { number, number_id } = result;
    db_helper.createOrder(number_id, ctx.from!.id, number, service.name);
    
    const message = [
      `━━━━━━━━━━━━━━━━━━━━`,
      `《 ✅ 𝗡𝗨𝗠𝗕𝗘𝗥𝗦 𝗔𝗟𝗟𝗢𝗖𝗔𝗧𝗘𝗗 》`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `<blockquote>📱 𝗦𝗘𝗥𝗩𝗜𝗖𝗘  <b>${service.name.toUpperCase()}</b></blockquote>`,
      `<blockquote>🌍 𝗖𝗢𝗨𝗡𝗧𝗥𝗬  <b>${(service.country || 'N/A').toUpperCase()}</b></blockquote>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `1️⃣ <b><code>${number}</code></b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `🚀 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬 𝗗𝗫𝗔 𝗨𝗡𝗜𝗩𝗘𝗥𝗦𝗘`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `\n<i>📬 𝗣𝗟𝗘𝗔𝗦𝗘 𝗪𝗔𝗜𝗧 𝗙𝗢𝗥 𝗢𝗧𝗣...</i>`
    ].join('\n');

    const otpGroupLink = db_helper.getSetting('otp_group_link') || 'https://t.me/example_group';
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Change Number', `buy_${serviceId}`)],
      [Markup.button.url('👥 OTP Group', otpGroupLink)],
      [Markup.button.callback('⬅️ Back', 'back_to_services')]
    ]);

    await updateUI(ctx, message, keyboard);

    // Start polling for OTP
    pollForOtp(ctx, number_id);
  } else {
    const errorMsg = result?.error || 'No numbers found for this service at the moment.';
    await updateUI(ctx, `❌ <b>Error:</b> ${errorMsg}\n\nPlease try again later.`, 
      Markup.inlineKeyboard([[Markup.button.callback('🔙 Go Back', 'back_to_services')]])
    );
  }
});

// Back action
bot.action('back_to_services', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;

  const services = db_helper.getServices();
  if (services.length === 0) {
    return updateUI(ctx, '❌ No services available.');
  }
  const buttons = services.map(s => [Markup.button.callback(`${s.name} (${s.country})`, `buy_${s.id}`)]);
  await updateUI(ctx, '🔍 Which service do you need a number for?', Markup.inlineKeyboard(buttons));
});

// OTP Polling Logic
const pollForOtp = async (ctx: MyContext, numberId: string) => {
  let attempts = 0;
  const maxAttempts = 30; // 30 * 10s = 300s (5 minutes)
  
  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      await updateUI(ctx, `⏰ Timeout! No OTP received for ${numberId}.`);
      return;
    }

    const res = await nexaApi.checkSms(numberId);
    if (res && res.success && res.otp) {
      clearInterval(poll);
      db_helper.updateOrderOtp(numberId, res.otp);
      
      const logGroupId = db_helper.getSetting('log_group_id');
      const otpText = [
        `𝗗𝗫𝗔 𝗡𝗨𝗠𝗕𝗘𝗥:`,
        ` ${res.service} 🌍 ${res.number} #EN`,
        `🔑 OTP: <code>${res.otp}</code>`
      ].join('\n');
      
      const inlineKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`📋 Copy OTP: ${res.otp}`, `copy_otp_${res.otp}`)]
      ]);

      await updateUI(ctx, otpText, inlineKeyboard);

      if (logGroupId) {
        try {
          const service = db_helper.getServices().find(s => s.name === res.service) || { country: '🌍' };
          const countryEmoji = service.country.match(/[\uD83C|\uD83D][\uDDC0-\uDFFF]|\uD83C[\uDDE6-\uDDFF]/g)?.[0] || '🌍';
          
          const groupMessage = [
            `𝗗𝗫𝗔 𝗡𝗨𝗠𝗕𝗘𝗥:`,
            ` ${res.service} ${countryEmoji} ${res.number} #EN`,
            `🔑 OTP: <code>${res.otp}</code>`
          ].join('\n');

          const inlineKeyboard = Markup.inlineKeyboard([
             [Markup.button.callback(`📋 Copy OTP: ${res.otp}`, `copy_otp_${res.otp}`)]
          ]);

          await ctx.telegram.sendMessage(logGroupId, groupMessage, { parse_mode: 'HTML', ...inlineKeyboard });
        } catch (e) {
          console.error('Failed to send to log group:', e);
        }
      }
    }
  }, 10000); // Poll every 10 seconds
};

bot.action(/^copy_otp_(.+)$/, async (ctx) => {
  const otp = ctx.match[1];
  await ctx.answerCbQuery(`✅ OTP ${otp} copied (internal reference update)!`, { show_alert: false });
});

bot.action('admin_delete_api_key', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.lastMessageId = ctx.callbackQuery!.message!.message_id;
  db_helper.deleteSetting('nexa_api_key');
  await ctx.answerCbQuery('🗑️ API Key deleted.');
  await updateUI(ctx, '✅ API Key has been removed from database.', apiManageMenu());
});

bot.action('admin_broadcast', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.step = 'awaiting_broadcast';
  await ctx.reply('📢 Please send or forward the message you want to broadcast (Text, Photo, Video, Sticker, etc.):');
});

// Admin handlers
bot.action('admin_check_balance', async (ctx) => {
  const balance = await nexaApi.getBalance();
  if (balance && balance.success) {
    await updateUI(ctx, `💰 Your current API Balance: <b>${balance.balance} BDT</b>`, adminMenuMain());
  } else {
    await updateUI(ctx, '❌ Error checking balance.', adminMenuMain());
  }
});

bot.action('admin_set_api_key', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.step = 'awaiting_api_key';
  await ctx.reply('🔑 Please send the new <b>Nexa API Key</b>:', { parse_mode: 'HTML' });
});

// Admin Add Service (Simple implementation using session)
bot.action('admin_add_service', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  ctx.session.step = 'awaiting_service_name';
  await ctx.reply('📝 What is the name of the service? (e.g., Facebook, WhatsApp)');
});

bot.action('admin_list_delete_service', async (ctx) => {
  const services = db_helper.getServices();
  if (services.length === 0) return ctx.reply('❌ No services found.');
  
  const buttons = services.map(s => [Markup.button.callback(`🗑️ Delete: ${s.name}`, `del_${s.id}`)]);
  await ctx.reply('🗑️ Which service do you want to delete?', Markup.inlineKeyboard(buttons));
});

bot.action(/^del_(\d+)$/, async (ctx) => {
  const id = parseInt(ctx.match[1]);
  db_helper.deleteService(id);
  await ctx.answerCbQuery('🗑️ Deleted successfully.');
  await ctx.reply('✅ Service deleted.');
});

// Message handler for text and other types (sessions)
bot.on('message', async (ctx) => {
  const sessionData = ctx.session;
  if (!sessionData || !sessionData.step) return;

  // Broadcast logic
  if (sessionData.step === 'awaiting_broadcast') {
    const users = db_helper.getAllUsers();
    let success = 0;
    let failed = 0;

    await ctx.reply('🚀 Broadcasting started...');

    for (const userId of users) {
      try {
        await ctx.telegram.copyMessage(userId, ctx.chat.id, ctx.message.message_id);
        success++;
      } catch (e) {
        failed++;
      }
    }

    ctx.session = {};
    await ctx.reply(`✅ Broadcast Finished!\n\n👥 Total Users: ${users.length}\n✅ Success: ${success}\n❌ Failed: ${failed}`);
    return;
  }

  // Text-based session handlers
  if ('text' in ctx.message) {
    const text = ctx.message.text;

    if (sessionData.step === 'awaiting_otp_link') {
      db_helper.setSetting('otp_group_link', text);
      ctx.session = {};
      await ctx.reply('✅ OTP Group Link has been updated successfully!');
    }
    else if (sessionData.step === 'awaiting_log_group') {
      db_helper.setSetting('log_group_id', text);
      ctx.session = {};
      await ctx.reply('✅ Log Group ID has been updated successfully!');
    }
    else if (sessionData.step === 'awaiting_api_key') {
      db_helper.setSetting('nexa_api_key', text);
      ctx.session = {};
      await ctx.reply('✅ Nexa API Key has been updated successfully!');
    }
    else if (sessionData.step === 'awaiting_service_name') {
      sessionData.tempName = text;
      sessionData.step = 'awaiting_service_country';
      await ctx.reply(`🏢 Service: <b>${sessionData.tempName}</b>\n\nPlease enter the <b>Country Name</b>:`, { parse_mode: 'HTML' });
    } 
    else if (sessionData.step === 'awaiting_service_country') {
      sessionData.tempCountry = text;
      sessionData.step = 'awaiting_range_code';
      await ctx.reply(`🌍 Country: <b>${sessionData.tempCountry}</b>\n\nPlease enter the <b>Range Code</b> (e.g., 99298XXX):`, { parse_mode: 'HTML' });
    }
    else if (sessionData.step === 'awaiting_range_code') {
      if (sessionData.tempName) {
        db_helper.addService(sessionData.tempName, text, sessionData.tempCountry);
      }
      ctx.session = {};
      await ctx.reply('✅ Service added successfully!', mainMenu());
    }
  }
});
