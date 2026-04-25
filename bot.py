import sqlite3
import asyncio
import logging
import aiohttp
import os
from aiogram import Bot, Dispatcher, types, F
from aiogram.filters import Command
from aiogram.utils.keyboard import InlineKeyboardBuilder, ReplyKeyboardBuilder
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage

# --- CONFIGURATION ---
TOKEN = "7735071779:AAFF5bSVFDgQJY31qkjW38XaVCewdgEtfR4"
OWNER_ID = 8197284774
DEFAULT_NEXA_API_KEY = "nxa_9ad17cea99f85040fde8eb4fabdbff6f47f1e613"
NEXA_BASE_URL = "http://2.58.82.137/api/v1"

# --- DATABASE SETUP ---
def init_db():
    conn = sqlite3.connect('bot_database.db', check_same_thread=False)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS admins (user_id INTEGER PRIMARY KEY)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS services (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        country TEXT DEFAULT '🌍',
                        range_code TEXT NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS orders (
                        id TEXT PRIMARY KEY,
                        user_id INTEGER,
                        number TEXT,
                        service TEXT,
                        otp TEXT,
                        status TEXT DEFAULT 'pending',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)''')
    
    # Ensure owner is in admin table
    cursor.execute("INSERT OR IGNORE INTO admins (user_id) VALUES (?)", (OWNER_ID,))
    conn.commit()
    return conn

db_conn = init_db()

def db_query(query, params=(), fetchone=False, fetchall=False, commit=False):
    cursor = db_conn.cursor()
    cursor.execute(query, params)
    res = None
    if fetchone: res = cursor.fetchone()
    if fetchall: res = cursor.fetchall()
    if commit: db_conn.commit()
    return res

# --- NEXA API CLIENT ---
class NexaAPI:
    def get_api_key(self):
        res = db_query("SELECT value FROM settings WHERE key = 'nexa_api_key'", fetchone=True)
        return res[0] if res else DEFAULT_NEXA_API_KEY

    async def get_balance(self):
        async with aiohttp.ClientSession() as session:
            headers = {"X-API-Key": self.get_api_key()}
            try:
                async with session.get(f"{NEXA_BASE_URL}/balance", headers=headers) as resp:
                    return await resp.json()
            except: return None

    async def request_number(self, range_code: str):
        async with aiohttp.ClientSession() as session:
            headers = {"X-API-Key": self.get_api_key()}
            payload = {"range": range_code, "format": "normal"}
            try:
                async with session.post(f"{NEXA_BASE_URL}/numbers/get", headers=headers, json=payload) as resp:
                    return await resp.json()
            except: return {"success": False, "error": "Connection error"}

    async def check_sms(self, number_id: str):
        async with aiohttp.ClientSession() as session:
            headers = {"X-API-Key": self.get_api_key()}
            try:
                async with session.get(f"{NEXA_BASE_URL}/numbers/{number_id}/sms", headers=headers) as resp:
                    return await resp.json()
            except: return None

nexa_api = NexaAPI()

# --- BOT SETUP ---
class Form(StatesGroup):
    awaiting_api_key = State()
    awaiting_service_name = State()
    awaiting_service_country = State()
    awaiting_range_code = State()
    awaiting_broadcast = State()
    awaiting_otp_link = State()
    awaiting_log_group = State()

dp = Dispatcher(storage=MemoryStorage())
bot = Bot(token=TOKEN)

def main_menu(user_id: int):
    kb = ReplyKeyboardBuilder()
    kb.button(text="📱 Get Number")
    if user_id == OWNER_ID:
        kb.button(text="⚙️ Admin Panel")
    return kb.as_markup(resize_keyboard=True)

def admin_main_menu():
    kb = InlineKeyboardBuilder()
    kb.row(types.InlineKeyboardButton(text="🛠️ Manage Service", callback_data="admin_manage_services"))
    kb.row(types.InlineKeyboardButton(text="📢 Broadcast", callback_data="admin_broadcast"))
    kb.row(types.InlineKeyboardButton(text="⚙️ Group Settings", callback_data="admin_manage_groups"))
    kb.row(types.InlineKeyboardButton(text="🔑 Nexa API Key", callback_data="admin_manage_api"))
    kb.row(types.InlineKeyboardButton(text="💰 Balance", callback_data="admin_check_balance"))
    return kb.as_markup()

# --- HANDLERS ---
@dp.message(Command("start"))
async def start(message: types.Message):
    user_id = message.from_user.id
    db_query("INSERT OR IGNORE INTO users (user_id) VALUES (?)", (user_id,), commit=True)
    
    welcome_text = "👋 Welcome to NexaOTP Bot!"
    if user_id == OWNER_ID:
        welcome_text = "👑 Welcome Master! You are the Admin of this bot."
    
    await message.answer(welcome_text, reply_markup=main_menu(user_id))

@dp.message(F.text == "📱 Get Number")
async def get_number_menu(message: types.Message):
    services = db_query("SELECT id, name, country FROM services", fetchall=True)
    if not services:
        return await message.answer("❌ No services found. Admin needs to add them.")
    
    kb = InlineKeyboardBuilder()
    for s_id, name, country in services:
        kb.row(types.InlineKeyboardButton(text=f"{name} ({country})", callback_data=f"buy_{s_id}"))
    await message.answer("🔍 Select a service:", reply_markup=kb.as_markup())

@dp.message(F.text == "⚙️ Admin Panel")
async def admin_panel(message: types.Message):
    if message.from_user.id != OWNER_ID:
        return await message.answer("❌ Access restricted to Bot Owner.")
    
    user_count = db_query("SELECT COUNT(*) FROM users", fetchone=True)[0]
    service_count = db_query("SELECT COUNT(*) FROM services", fetchone=True)[0]
    
    text = (f"👑 <b>ADMIN CONTROL PANEL</b>\n"
            f"━━━━━━━━━━━━━\n\n"
            f"👤 Users: {user_count}\n"
            f"🔢 Services: {service_count}\n\n"
            f"Select an action:")
    await message.answer(text, reply_markup=admin_main_menu(), parse_mode="HTML")

# --- ADMIN GROUP SETTINGS ---
@dp.callback_query(F.data == "admin_manage_groups")
async def manage_groups(callback: types.CallbackQuery):
    kb = InlineKeyboardBuilder()
    kb.row(types.InlineKeyboardButton(text="🔗 Set OTP Link", callback_data="admin_set_otp_link"), 
           types.InlineKeyboardButton(text="🗑️ Delete", callback_data="admin_delete_otp_link"))
    kb.row(types.InlineKeyboardButton(text="📊 Set Log ID", callback_data="admin_set_log_group"),
           types.InlineKeyboardButton(text="🗑️ Delete", callback_data="admin_delete_log_group"))
    kb.row(types.InlineKeyboardButton(text="⬅️ Back", callback_data="admin_back_to_main"))
    await callback.message.edit_text("⚙️ <b>Group Settings:</b>", reply_markup=kb.as_markup(), parse_mode="HTML")

@dp.callback_query(F.data == "admin_set_otp_link")
async def set_otp_link(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Form.awaiting_otp_link)
    await callback.message.answer("🔗 Send the Public Link for the OTP Group:")

@dp.message(Form.awaiting_otp_link)
async def process_otp_link(message: types.Message, state: FSMContext):
    db_query("INSERT OR REPLACE INTO settings (key, value) VALUES ('otp_group_link', ?)", (message.text,), commit=True)
    await state.clear()
    await message.answer("✅ OTP Group Link Saved!", reply_markup=main_menu(message.from_user.id))

@dp.callback_query(F.data == "admin_delete_otp_link")
async def delete_otp_link(callback: types.CallbackQuery):
    db_query("DELETE FROM settings WHERE key = 'otp_group_link'", commit=True)
    await callback.answer("🗑️ Deleted!")
    await callback.message.edit_text("✅ OTP Link removed.", reply_markup=admin_main_menu())

@dp.callback_query(F.data == "admin_set_log_group")
async def set_log_group(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Form.awaiting_log_group)
    await callback.message.answer("📊 Send the Chat ID (e.g., -100...) of the target group:")

@dp.message(Form.awaiting_log_group)
async def process_log_group(message: types.Message, state: FSMContext):
    db_query("INSERT OR REPLACE INTO settings (key, value) VALUES ('log_group_id', ?)", (message.text,), commit=True)
    await state.clear()
    await message.answer("✅ Log Group ID Saved!", reply_markup=main_menu(message.from_user.id))

@dp.callback_query(F.data == "admin_delete_log_group")
async def delete_log_group(callback: types.CallbackQuery):
    db_query("DELETE FROM settings WHERE key = 'log_group_id'", commit=True)
    await callback.answer("🗑️ Deleted!")
    await callback.message.edit_text("✅ Log ID removed.", reply_markup=admin_main_menu())

# --- SERVICE MANAGEMENT ---
@dp.callback_query(F.data == "admin_manage_services")
async def manage_services_query(callback: types.CallbackQuery):
    kb = InlineKeyboardBuilder()
    kb.row(types.InlineKeyboardButton(text="➕ Add Service", callback_data="admin_add_service"))
    kb.row(types.InlineKeyboardButton(text="🗑️ Delete Service", callback_data="admin_list_delete"))
    kb.row(types.InlineKeyboardButton(text="⬅️ Back", callback_data="admin_back_to_main"))
    await callback.message.edit_text("🛠️ Manage Services:", reply_markup=kb.as_markup())

@dp.callback_query(F.data == "admin_add_service")
async def add_service_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Form.awaiting_service_name)
    await callback.message.answer("📝 Service Name? (e.g. Facebook)")

@dp.message(Form.awaiting_service_name)
async def process_sname(message: types.Message, state: FSMContext):
    await state.update_data(name=message.text)
    await state.set_state(Form.awaiting_service_country)
    await message.answer("🌍 Country Emoji? (e.g. 🇧🇩)")

@dp.message(Form.awaiting_service_country)
async def process_scountry(message: types.Message, state: FSMContext):
    await state.update_data(country=message.text)
    await state.set_state(Form.awaiting_range_code)
    await message.answer("🔢 Range Code? (e.g. 99298XXX)")

@dp.message(Form.awaiting_range_code)
async def process_range(message: types.Message, state: FSMContext):
    data = await state.get_data()
    db_query("INSERT INTO services (name, country, range_code) VALUES (?, ?, ?)", 
             (data['name'], data['country'], message.text), commit=True)
    await state.clear()
    await message.answer("✅ Service Added!")

# --- BUY FLOW ---
@dp.callback_query(F.data.startswith("buy_"))
async def buy_number(callback: types.CallbackQuery):
    s_id = int(callback.data.split("_")[1])
    service = db_query("SELECT name, country, range_code FROM services WHERE id = ?", (s_id,), fetchone=True)
    if not service: return await callback.answer("❌ Error.")
    
    await callback.message.edit_text(f"⌛ Finding number for <b>{service[0]}</b>...", parse_mode="HTML")
    res = await nexa_api.request_number(service[2])
    
    if res.get('success'):
        number = res['number']
        number_id = res['id']
        db_query("INSERT INTO orders (id, user_id, number, service) VALUES (?, ?, ?, ?)",
                 (number_id, callback.from_user.id, number, service[0]), commit=True)
        
        otp_link_res = db_query("SELECT value FROM settings WHERE key = 'otp_group_link'", fetchone=True)
        otp_link = otp_link_res[0] if otp_link_res else "None"
        
        text = (f"━━━━━━━━━━━━━━━━━━━━\n"
                f"《 ✅ 𝗡𝗨𝗠𝗕𝗘𝗥𝗦 𝗔𝗟𝗟𝗢𝗖𝗔𝗧𝗘𝗗 》\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"<blockquote>📱 𝗦𝗘𝗥𝗩𝗜𝗖𝗘: <b>{service[0].upper()}</b></blockquote>\n"
                f"<blockquote>🌍 𝗖𝗢𝗨𝗡𝗧𝗥𝗬: <b>{service[1]}</b></blockquote>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"1️⃣ <b><code>{number}</code></b>\n"
                f"━━━━━━━━━━━━━━━━━━━━\n"
                f"\n<i>📬 𝗪𝗔𝗜𝗧𝗜𝗡𝗚 𝗙𝗢𝗥 𝗢𝗧𝗣...</i>")
        
        kb = InlineKeyboardBuilder()
        if otp_link != "None":
            kb.row(types.InlineKeyboardButton(text="👥 OTP Group", url=otp_link))
        
        await callback.message.edit_text(text, reply_markup=kb.as_markup(), parse_mode="HTML")
        asyncio.create_task(poll_otp(callback, number_id, service[0], service[1]))
    else:
        err = res.get('error', 'No numbers.')
        await callback.message.answer(f"❌ Error: {err}")

async def poll_otp(callback, number_id, service_name, country_emoji):
    attempts = 0
    max_attempts = 40 # ~6 mins
    log_group_id_res = db_query("SELECT value FROM settings WHERE key = 'log_group_id'", fetchone=True)
    log_group_id = log_group_id_res[0] if log_group_id_res else None

    while attempts < max_attempts:
        await asyncio.sleep(10)
        res = await nexa_api.check_sms(number_id)
        if res and res.get('success') and res.get('otp'):
            otp = res['otp']
            db_query("UPDATE orders SET otp = ?, status = 'completed' WHERE id = ?", (otp, number_id), commit=True)
            
            # FORMAT FOR USER/GROUP
            formatted_msg = (f"𝗗𝗫𝗔 𝗡𝗨𝗠𝗕𝗘𝗥:\n\n"
                             f" {service_name} {country_emoji} {res.get('number', 'N/A')} #EN\n"
                             f"🔑 OTP: <code>{otp}</code>")
            
            kb = InlineKeyboardBuilder()
            kb.button(text=f"📋 Copy OTP: {otp}", callback_data=f"copy_{otp}")
            
            # Send to User
            await callback.message.answer(formatted_msg, parse_mode="HTML", reply_markup=kb.as_markup())
            
            # Send to Log Group
            if log_group_id:
                try:
                    await bot.send_message(log_group_id, formatted_msg, parse_mode="HTML", reply_markup=kb.as_markup())
                except: pass
            return
        attempts += 1
    await callback.message.answer(f"⏰ Timeout: No OTP for {number_id}")

@dp.callback_query(F.data.startswith("copy_"))
async def copy_callback(callback: types.CallbackQuery):
    otp = callback.data.split("_")[1]
    await callback.answer(f"✅ OTP {otp} Copied!", show_alert=False)

@dp.callback_query(F.data == "admin_back_to_main")
async def back_main(callback: types.CallbackQuery):
    await admin_panel(callback.message)

@dp.callback_query(F.data == "admin_check_balance")
async def check_bal(callback: types.CallbackQuery):
    res = await nexa_api.get_balance()
    bal = res.get('balance', 'Error') if res else 'Error'
    await callback.answer(f"💰 Current Balance: {bal}", show_alert=True)

# --- BROADCAST ---
@dp.callback_query(F.data == "admin_broadcast")
async def broadcast_start(callback: types.CallbackQuery, state: FSMContext):
    await state.set_state(Form.awaiting_broadcast)
    await callback.message.answer("📢 Send the message to broadcast:")

@dp.message(Form.awaiting_broadcast)
async def process_bc(message: types.Message, state: FSMContext):
    users = db_query("SELECT user_id FROM users", fetchall=True)
    await message.answer(f"🚀 Sending to {len(users)} users...")
    success = 0
    for (u_id,) in users:
        try:
            await message.copy_to(u_id)
            success += 1
        except: pass
    await state.clear()
    await message.answer(f"✅ Done! Sent to {success} users.")

# --- RUN ---
async def main():
    logging.basicConfig(level=logging.INFO)
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
