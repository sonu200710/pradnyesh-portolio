# Portfolio Contact Form Setup

## Gmail App Password (REQUIRED)

1. Go to https://myaccount.google.com/apppasswords
2. Sign in with mistaripradnyesh@gmail.com
3. Turn on 2-Step Verification if not enabled
4. Select `App: Mail` → `Device: Other (Custom)`
5. Enter name "Portfolio Server"
6. Copy 16-char password (e.g. abcd efgh ijkl mnop)

## Edit server.js
Replace line:
```
pass: 'your-app-password'
```
With:
```
pass: 'abcd efgh ijkl mnop' // Your 16-char code (no spaces)
```

## Run Server
```
npm start
```

Form at http://localhost:3000/#contact sends emails to your Gmail inbox.

**Messages appear in Gmail → Mobile notifications/SMS via Gmail app.**
