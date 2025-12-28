// YouTube Sync Server - SSE Version (Fixed for reconnection)
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

// In-memory storage
const rooms = new Map();
const userToRoom = new Map();
const clients = new Map(); // clientId -> SSE response object

// Generate random 6-character room code
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Send event to specific client
function sendToClient(clientId, event, data) {
  const client = clients.get(clientId);
  if (client) {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

// Broadcast to room
function broadcastToRoom(roomCode, event, data, excludeId = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.users.forEach((username, userId) => {
    if (userId !== excludeId) {
      sendToClient(userId, event, data);
    }
  });
}

// SSE Connection endpoint (FIXED VERSION)
app.get('/connect', (req, res) => {
  const clientId = req.query.clientId || `client_${Date.now()}_${Math.random()}`;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Store client connection
  clients.set(clientId, res);
  
  // Send initial connection event
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({ clientId })}\n\n`);
  
  console.log(`✅ Client connected: ${clientId}`);
  
  // If client was in a room, send them the room state (for reconnection)
  const roomCode = userToRoom.get(clientId);
  if (roomCode) {
    const room = rooms.get(roomCode);
    if (room) {
      console.log(`🔄 Reconnecting ${clientId} to room ${roomCode}`);
      res.write(`event: room-joined\n`);
      res.write(`data: ${JSON.stringify({
        roomCode,
        users: Array.from(room.users.values()),
        currentVideo: room.currentVideo
      })}\n\n`);
    }
  }
  
  // Handle client disconnect
  req.on('close', () => {
    console.log(`⚠️ Client disconnected: ${clientId}`);
    clients.delete(clientId);
    
    // IMPORTANT: Don't immediately remove from room
    // Give them 10 seconds to reconnect (for page navigation)
    setTimeout(() => {
      // Check if they reconnected
      if (!clients.has(clientId)) {
        const roomCode = userToRoom.get(clientId);
        if (roomCode) {
          console.log(`❌ Client ${clientId} didn't reconnect, removing from room`);
          handleUserLeave(clientId, roomCode);
        }
      } else {
        console.log(`✅ Client ${clientId} reconnected successfully`);
      }
    }, 10000); // 10 second grace period
  });
});

// Create room
app.post('/create-room', (req, res) => {
  const { username, clientId } = req.body;
  const roomCode = generateRoomCode();
  
  rooms.set(roomCode, {
    host: clientId,
    users: new Map([[clientId, username || 'Host']]),
    currentVideo: null
  });
  
  userToRoom.set(clientId, roomCode);
  
  console.log(`📦 Room created: ${roomCode} by ${username}`);
  
  res.json({
    roomCode,
    users: Array.from(rooms.get(roomCode).users.values())
  });
  
  sendToClient(clientId, 'room-created', {
    roomCode,
    users: Array.from(rooms.get(roomCode).users.values())
  });
});

// Join room
app.post('/join-room', (req, res) => {
  const { roomCode, username, clientId } = req.body;
  const room = rooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const displayName = username || 'Guest';
  room.users.set(clientId, displayName);
  userToRoom.set(clientId, roomCode);
  
  console.log(`👋 ${displayName} joined room: ${roomCode}`);
  
  res.json({
    roomCode,
    users: Array.from(room.users.values()),
    currentVideo: room.currentVideo
  });
  
  sendToClient(clientId, 'room-joined', {
    roomCode,
    users: Array.from(room.users.values()),
    currentVideo: room.currentVideo
  });
  
  broadcastToRoom(roomCode, 'user-joined', {
    username: displayName,
    users: Array.from(room.users.values())
  }, clientId);
});

// Video control endpoints
app.post('/video-changed', (req, res) => {
  const { clientId, videoId, timestamp } = req.body;
  const roomCode = userToRoom.get(clientId);
  const room = rooms.get(roomCode);
  
  if (!room || room.host !== clientId) {
    return res.status(403).json({ error: 'Only host can change video' });
  }
  
  room.currentVideo = { videoId, timestamp };
  console.log(`🎬 Video changed in ${roomCode}: ${videoId}`);
  
  broadcastToRoom(roomCode, 'video-changed', { videoId, timestamp }, clientId);
  res.json({ success: true });
});

app.post('/play', (req, res) => {
  const { clientId, timestamp } = req.body;
  const roomCode = userToRoom.get(clientId);
  const room = rooms.get(roomCode);
  
  if (!room || room.host !== clientId) {
    return res.status(403).json({ error: 'Only host can control playback' });
  }
  
  console.log(`▶️ Play in ${roomCode}`);
  broadcastToRoom(roomCode, 'play', { timestamp }, clientId);
  res.json({ success: true });
});

app.post('/pause', (req, res) => {
  const { clientId, timestamp } = req.body;
  const roomCode = userToRoom.get(clientId);
  const room = rooms.get(roomCode);
  
  if (!room || room.host !== clientId) {
    return res.status(403).json({ error: 'Only host can control playback' });
  }
  
  console.log(`⏸️ Pause in ${roomCode}`);
  broadcastToRoom(roomCode, 'pause', { timestamp }, clientId);
  res.json({ success: true });
});

app.post('/seek', (req, res) => {
  const { clientId, timestamp } = req.body;
  const roomCode = userToRoom.get(clientId);
  const room = rooms.get(roomCode);
  
  if (!room || room.host !== clientId) {
    return res.status(403).json({ error: 'Only host can control playback' });
  }
  
  console.log(`⏩ Seek in ${roomCode}`);
  broadcastToRoom(roomCode, 'seek', { timestamp }, clientId);
  res.json({ success: true });
});

app.post('/send-message', (req, res) => {
  const { clientId, message } = req.body;
  const roomCode = userToRoom.get(clientId);
  const room = rooms.get(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Not in a room' });
  }
  
  const username = room.users.get(clientId);
  const trimmedMessage = message.substring(0, 500);
  
  console.log(`💬 Message in ${roomCode} from ${username}`);
  
  const messageData = {
    username,
    message: trimmedMessage,
    timestamp: Date.now()
  };
  
  // Broadcast to everyone in the room (including sender)
  broadcastToRoom(roomCode, 'receive-message', messageData);
  
  res.json({ success: true });
});

app.post('/leave-room', (req, res) => {
  const { clientId } = req.body;
  const roomCode = userToRoom.get(clientId);
  
  if (roomCode) {
    handleUserLeave(clientId, roomCode);
  }
  
  res.json({ success: true });
});

function handleUserLeave(clientId, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  const username = room.users.get(clientId);
  room.users.delete(clientId);
  userToRoom.delete(clientId);
  
  console.log(`👋 ${username} left room: ${roomCode}`);
  
  if (room.users.size === 0 || room.host === clientId) {
    console.log(`🗑️ Room ${roomCode} closed`);
    broadcastToRoom(roomCode, 'room-error', {
      message: 'Host left. Room closed.'
    });
    
    // Clean up all users
    room.users.forEach((_, userId) => {
      userToRoom.delete(userId);
    });
    
    rooms.delete(roomCode);
  } else {
    broadcastToRoom(roomCode, 'user-left', {
      username,
      users: Array.from(room.users.values())
    });
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: rooms.size,
    connections: clients.size
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   YouTube Sync Server (SSE) 🚀        ║
╠═══════════════════════════════════════╣
║   Port: ${PORT}                          ║
║   SSE: Ready ✅                        ║
║   CORS: Enabled                       ║
║   Reconnection: 10s grace period      ║
╚═══════════════════════════════════════╝
  `);
});