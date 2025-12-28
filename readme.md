# SyncYoo 🎬

<div align="center">

**Watch YouTube videos in perfect sync with friends in real-time**

[![GitHub](https://img.shields.io/badge/GitHub-incursio--xd-181717?style=flat&logo=github)](https://github.com/incursio-xd)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## 📖 About

**SyncYoo** is a Chrome extension that enables real-time synchronized video watching on YouTube. Create a room, share the code with friends, and watch together with perfectly synced playback, seek, and pause controls—all through an elegant floating window interface.

Built with **Server-Sent Events (SSE)** for real-time communication, SyncYoo features intelligent reconnection handling, latency compensation for frame-accurate synchronization, and a built-in chat system.

---

## ✨ Features

### 🎯 Core Functionality
- **Real-time Synchronization**: Play, pause, and seek events synced across all participants
- **Room-based Sessions**: Create or join rooms using simple 6-character codes
- **Host Controls**: Only the room creator can control playback (prevent chaos!)
- **Smart Reconnection**: 10-second grace period for page navigation—stay synced even when changing videos

### 💬 Communication
- **Built-in Chat**: Message participants without leaving the video
- **User List**: See who's watching with you
- **System Notifications**: Get notified when users join or leave

### 🔧 Technical Excellence
- **Latency Compensation**: Predictive sync positioning for sub-200ms accuracy
- **Memory Efficient**: Proper cleanup prevents memory leaks during long sessions
- **Session Persistence**: Chat history and connection state survive video changes
- **Cross-page Support**: Navigate between videos without losing your room

### 🎨 User Experience
- **Floating Window**: Non-intrusive, draggable interface
- **Position Memory**: Window remembers where you placed it
- **Status Indicators**: Real-time connection status with visual feedback
- **Smooth Animations**: Polished transitions and notifications

---

## 🚀 Quick Start

> ⚠️ **Important**: SyncYoo requires a backend server. You must run your own server (instructions below) or deploy one to use this extension. There is no public server provided.

### Setup Instructions

**Step 1: Start the Backend Server**

1. **Navigate to backend directory**
   ```bash
   git clone https://github.com/incursio-xd/syncyoo.git
   cd syncyoo/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   Server runs on `http://localhost:3000` by default.
   
   > **Note**: Keep this terminal running while using the extension.

**Step 2: Load the Chrome Extension**

1. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable **Developer mode** (toggle in top-right)

2. **Load the extension**
   - Click **Load unpacked**
   - Select the `syncyoo/extension` folder

**Step 3: Configure Server URL (if needed)**

The extension is pre-configured for `http://localhost:3000`. If you deployed your server elsewhere, edit `extension/content.js` line 4:

```javascript
const SERVER_URL = 'http://localhost:3000'; // Change if you deployed elsewhere
```

**Step 4: Start Syncing!**
   - Go to any YouTube video
   - The SyncYoo window appears automatically
   - Create a room or join with a code

### For Developers (Deploy Your Own Server)

> 💡 **Already running locally?** Skip to "Deploy Server" if you want to make it accessible to friends.

#### Deploy Server (Optional)

Deploy your backend to make it accessible from anywhere (not just localhost):

**Deployment Options:**

1. **Render** (Recommended - Free tier available)
   - Connect your GitHub repo
   - Select `backend` folder as root directory
   - Set build command: `npm install`
   - Set start command: `npm start`
   - Deploy!

2. **Heroku**
   ```bash
   cd backend
   heroku create your-app-name
   git subtree push --prefix backend heroku main
   ```

3. **Railway** / **DigitalOcean** / **Vercel**
   - Import project
   - Set root directory to `backend/`
   - Deploy

**After Deployment:**

Update `extension/content.js` line 4 with your deployed URL:
```javascript
const SERVER_URL = 'https://your-app.onrender.com'; // Your deployed URL
```

**No environment variables needed!** Just deploy and run.

---

## 🛠️ Tech Stack

### Frontend (Chrome Extension)
- **Vanilla JavaScript**: No frameworks, pure performance
- **CSS3**: Modern styling with gradients and animations
- **Chrome Extension API**: Manifest V3
- **EventSource API**: Server-Sent Events for real-time updates

### Backend (Node.js Server)
- **Express.js**: HTTP server and routing
- **CORS**: Cross-origin resource sharing
- **Server-Sent Events (SSE)**: Uni-directional real-time communication
- **In-memory storage**: Fast, simple state management

### Key Technologies
- **Real-time Sync**: SSE with reconnection logic
- **Latency Compensation**: Predictive positioning algorithm
- **Memory Management**: Proper event listener cleanup
- **Session Persistence**: sessionStorage for state

---

## 📂 Project Structure

```
syncyoo/
├── backend/
│   ├── node_modules/      # Server dependencies
│   ├── .gitignore         # Git ignore rules for backend
│   ├── package-lock.json  # Locked dependency versions
│   ├── package.json       # Node.js dependencies
│   └── server.js          # Express server with SSE (200+ lines)
│
├── extension/
│   ├── icons/             # Extension icons
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   ├── content.js         # Main extension logic (300+ lines)
│   ├── floating-window.css # UI styles
│   └── manifest.json      # Chrome extension configuration
│
└── README.md              # This file
```

---

## 🎮 How to Use

### Creating a Room

1. Open any YouTube video
2. Enter your name in the SyncYoo window
3. Click **"Create Room"**
4. Share the 6-character room code with friends
5. You're now the host—your playback controls everyone's video

### Joining a Room

1. Open any YouTube video
2. Enter your name
3. Click **"Join Room"**
4. Enter the room code
5. Your video will sync to the host's playback

### Features While Watching

- **Chat**: Type messages and press Enter or click Send
- **User List**: See all participants in the top-right
- **Status Indicator**: Green dot = connected, Red dot = disconnected
- **Leave Room**: Click "Leave Room" to exit
- **Minimize**: Use the minimize button to collapse the window
- **Drag**: Click and drag the header to reposition

---

## 🔧 Configuration

### Server Configuration

Edit `backend/server.js` to customize:

```javascript
// Change reconnection grace period (default: 10 seconds)
setTimeout(() => {
  // ...
}, 10000); // Change this value

// Change server port
const PORT = process.env.PORT || 3000; // Change default port
```

### Client Configuration

Edit `extension/content.js` to customize:

```javascript
// Server URL
const SERVER_URL = 'https://your-server.com';

// Sync threshold (default: 0.5 seconds)
if (drift > 0.5) { ... } // Adjust sensitivity

// Reconnection attempts
setTimeout(() => {
  connectToServer();
}, 3000); // Adjust retry delay
```

---

## 🧪 Technical Details

### Synchronization Algorithm

1. **Latency Measurement**: Server connection time estimates network latency
2. **Compensation**: Add latency + 50ms processing buffer to timestamps
3. **Predictive Positioning**: Seek to compensated position before playback
4. **Fine-tuning**: Micro-adjustments 150ms after sync for drift correction
5. **Threshold**: Re-sync if drift exceeds 0.5 seconds

### Memory Management

- **Event Listeners**: Stored references, cleaned up on video change
- **Mutation Observer**: Disconnected and recreated properly
- **EventSource**: Closed on cleanup and page unload
- **Session Storage**: Limited to 50 recent chat messages

### Reconnection Logic

- **10-second grace period**: Wait before removing disconnected users
- **Session persistence**: clientId stored in sessionStorage
- **State restoration**: Chat history and room state restored on reconnect
- **Video navigation**: State saved before URL change

---

## 🐛 Known Limitations

- Works only on `youtube.com/watch` pages (not embedded videos)
- Host must stay in the room (no host transfer yet)
- Maximum message length: 500 characters
- Chat history limited to 50 messages
- Rooms are temporary (cleared when empty or host leaves)
- No authentication (rooms are open to anyone with code)

---

## 🔒 Security Notes

**Current Implementation:**

This project is designed for **personal/private use** or small groups of trusted users. The server has:

- ❌ No rate limiting
- ❌ No input validation/sanitization
- ❌ CORS open to all origins (`origin: '*'`)
- ❌ No authentication system
- ❌ No protection against spam/abuse

**Why this matters:**

- Anyone with your server URL can create/join rooms
- Malicious users could spam messages or create unlimited rooms
- Server could be overloaded if exposed publicly

**Recommendations:**

- ✅ Use on localhost for personal use
- ✅ Deploy privately and share URL only with trusted friends
- ✅ Don't share your deployed server URL publicly
- ✅ Monitor your hosting platform's usage

**For Production Use (Advanced):**

If you want to run a public server, you should add:
1. Rate limiting (use `express-rate-limit` package)
2. Input sanitization (validate all user inputs)
3. Restrict CORS to specific domains
4. Implement room passwords or authentication
5. Add message moderation/filtering

See the [Contributing](#-contributing) section if you'd like to implement these features.

---

## 📊 Performance

- **Sync Accuracy**: Sub-200ms under good network conditions
- **Memory Usage**: ~20-30MB for extension
- **Server Load**: ~1-2MB per active room
- **Latency Impact**: Automatically compensated
- **Reconnection Time**: ~3 seconds average

---

## 🤝 Contributing

This is an open-source project! Feel free to:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Clone repo
git clone https://github.com/incursio-xd/syncyoo.git
cd syncyoo

# Install server dependencies
cd backend
npm install

# Start server with auto-reload
npm run dev

# Load extension in Chrome (Developer mode)
# Navigate to chrome://extensions/
# Load unpacked -> select syncyoo/extension folder
```

---

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Aman Nath Jha**

- GitHub: [@incursio-xd](https://github.com/incursio-xd)

---

## 🙏 Acknowledgments

- Built with ❤️ for seamless video watching with friends
- Inspired by the need for better remote watch parties
- Thanks to the Chrome Extension and Node.js communities

---

## 📮 Support

If you encounter any issues or have questions:

1. Check the [Known Limitations](#-known-limitations) section
2. Open an issue on GitHub
3. Contact via GitHub profile

---

<div align="center">

**Made with 🎬 by Aman Nath Jha**

If you found this helpful, consider giving it a ⭐ on GitHub!

</div>