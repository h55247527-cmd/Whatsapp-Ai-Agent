# 🤖 WhatsApp Personal AI Bot v2.0

> Tumhari jagah reply kare — kisi ko pata na chale ke bot hai.
> Powered by **Groq (free)** + **Baileys (free)**

---

## ✨ Features

| Feature | Details |
|---|---|
| 🧠 AI Clone | Tumhari personality copy karta hai |
| 👥 Friends | Casual, natural dost wali baat |
| 👤 Unknown | Politely poochta hai kaun hai |
| 💼 Client Mode | Project details nikalta hai step by step |
| 💰 Auto Quote | Project info ke basis pe price range deta hai |
| 🚫 Spam Detection | Spam detect karta hai, warn karta hai, block karta hai |
| 💬 Memory | Har user ki conversation yaad rakhta hai |
| ⏱️ Natural Delay | Human jesa typing delay |

---

## 🚀 Setup (5 minutes)

### Step 1 — Install dependencies
```bash
npm install
```

### Step 2 — Configure `.env`
```env
GROQ_API_KEY=your_key_here        # console.groq.com pe free account
MY_NUMBER=923001234567             # Tumhara number (no + sign)
MY_NAME=Hashir                     # Tumhara naam
MY_PERSONALITY=...                 # Apni personality describe karo
LANGUAGE=hinglish                  # hinglish / urdu / english
```

### Step 3 — Apne dost add karo (optional)
`src/utils/contactManager.js` mein `savedContacts` set mein numbers add karo:
```js
const savedContacts = new Set([
  '923001234567',  // Ali ka number
  '923151234567',  // Ahmed ka number
]);
```
Friends automatically casual mode mein aate hain!

### Step 4 — Run karo
```bash
npm start
```

### Step 5 — QR Scan
Terminal mein QR aayega → WhatsApp → Linked Devices → Link a Device

---

## 💼 Client Flow (kaise kaam karta hai)

```
Unknown: "bhai website banwani hai"
Bot:     "Sure! Pehle bata website kis baare mein hogi?"
Unknown: "clothing store"
Bot:     "Nice! Kitne pages chahiye? (home, shop, about, contact...)"
Unknown: "5-6 pages chahiye"
Bot:     "Features kya kya chahiye? Login, payments, kuch aur?"
Unknown: "login aur payment bhi chahiye"
Bot:     "Design preference? Dark/light? Koi reference site hai?"
...
[After all info collected]
Bot:     "Apki project dekh ke main estimate karta hoon:
          ✅ Clothing e-commerce (5-6 pages)
          ✅ User login + payment integration
          ✅ Custom design
          
          Main charge karunga: 35,000 – 50,000 PKR
          
          Isme shaamil hai: frontend, backend, payment, deployment.
          Timeline: 2-3 hafta."
```

---

## 🚫 Spam System

- **Score 3+** per message = Warning
- **Cumulative 8+** = Spammer flag
- **Cumulative 12+** = Auto block (silent)

---

## 📁 Project Structure

```
whatsapp-bot/
├── src/
│   ├── index.js              # Main entry, WA connection
│   ├── handlers/
│   │   └── messageHandler.js # Message routing logic
│   ├── services/
│   │   └── groqService.js    # AI brain (Groq API)
│   └── utils/
│       ├── contactManager.js # Contacts, spam detection
│       └── memory.js         # Per-user conversation memory
├── sessions/                 # WhatsApp session (auto-created)
├── .env                      # Your config
└── package.json
```

---

## ⚠️ Important Notes

1. **Ek phone pe ek session** — agar WhatsApp Web kholo to bot disconnect hoga
2. **Sessions folder mat delete karo** — warna QR dobara scan karna hoga
3. **Groq free tier** — 30 req/min, enough for personal use
4. **Railway pe deploy** karo free mein (tumhara fav hosting!)

---

## 🚀 Railway Deployment

```bash
# Procfile already set hai
# Railway pe:
# 1. GitHub se connect karo
# 2. Environment variables add karo
# 3. Deploy!
```
