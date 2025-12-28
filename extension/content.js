// Content Script - Fixed Version (Memory Leaks + Sync Issues)
console.log('🚀 YT Sync Content Script Loading...');

const SERVER_URL = 'http://localhost:3000';

let eventSource = null;
let clientId = null;
let floatingWindow = null;
let currentVideoId = null;
let player = null;
let isHost = false;
let inRoom = false;
let isSyncing = false;
let username = 'User';

// Memory leak fix: Store listener references
let playerListeners = null;
let mutationObserver = null;

// Sync improvement: Track network latency
let estimatedLatency = 0.15; // 150ms default
let lastPingTime = 0;

function generateClientId() {
  try {
    const savedClientId = sessionStorage.getItem('ytSyncClientId');
    if (savedClientId) {
      console.log('🔄 Restoring client ID:', savedClientId);
      return savedClientId;
    }
  } catch (e) {
    console.log('Could not restore client ID');
  }
  
  const newClientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    sessionStorage.setItem('ytSyncClientId', newClientId);
  } catch (e) {
    console.log('Could not save client ID');
  }
  
  console.log('✨ Generated new client ID:', newClientId);
  return newClientId;
}

function connectToServer() {
  clientId = generateClientId();
  console.log('📡 Connecting to server with ID:', clientId);
  
  // Measure connection latency
  lastPingTime = Date.now();
  
  eventSource = new EventSource(`${SERVER_URL}/connect?clientId=${clientId}`);
  
  eventSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    
    // Calculate latency from connection time
    const latency = (Date.now() - lastPingTime) / 1000;
    estimatedLatency = Math.min(latency, 0.5); // Cap at 500ms
    
    console.log('✅ Connected to server:', data.clientId, `(latency: ${(estimatedLatency * 1000).toFixed(0)}ms)`);
    updateConnectionStatus(true);
    showNotification('Connected to server!', 'info');
  });
  
  eventSource.addEventListener('room-created', (e) => {
    const data = JSON.parse(e.data);
    handleRoomCreated(data);
  });
  
  eventSource.addEventListener('room-joined', (e) => {
    const data = JSON.parse(e.data);
    handleRoomJoined(data);
  });
  
  eventSource.addEventListener('user-joined', (e) => {
    const data = JSON.parse(e.data);
    handleUserJoined(data);
  });
  
  eventSource.addEventListener('user-left', (e) => {
    const data = JSON.parse(e.data);
    handleUserLeft(data);
  });
  
  eventSource.addEventListener('room-error', (e) => {
    const data = JSON.parse(e.data);
    showNotification(data.message, 'error');
  });
  
  eventSource.addEventListener('video-changed', (e) => {
    if (!isHost) {
      const data = JSON.parse(e.data);
      handleVideoChangedRemote(data);
    }
  });
  
  eventSource.addEventListener('play', (e) => {
    if (!isHost) {
      const data = JSON.parse(e.data);
      handlePlayRemote(data);
    }
  });
  
  eventSource.addEventListener('pause', (e) => {
    if (!isHost) {
      const data = JSON.parse(e.data);
      handlePauseRemote(data);
    }
  });
  
  eventSource.addEventListener('seek', (e) => {
    if (!isHost) {
      const data = JSON.parse(e.data);
      handleSeekRemote(data);
    }
  });
  
  eventSource.addEventListener('receive-message', (e) => {
    const data = JSON.parse(e.data);
    addChatMessage(data);
  });
  
  eventSource.onerror = (error) => {
    console.error('❌ SSE Connection error:', error);
    updateConnectionStatus(false);
    showNotification('Connection lost. Reconnecting...', 'error');
    
    setTimeout(() => {
      if (eventSource) {
        eventSource.close();
      }
      connectToServer();
    }, 3000);
  };
}

async function sendToServer(endpoint, data) {
  try {
    const response = await fetch(`${SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, clientId })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Request failed');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Request error:', error);
    showNotification(error.message, 'error');
    throw error;
  }
}

async function init() {
  console.log('YouTube Sync: Initializing...');
  
  username = 'User' + Math.floor(Math.random() * 1000);
  
  try {
    const reconnectData = sessionStorage.getItem('ytSyncReconnect');
    if (reconnectData) {
      const data = JSON.parse(reconnectData);
      if (Date.now() - data.timestamp < 10000) {
        username = data.username;
        console.log('🔄 Reconnecting after video change...');
      }
      sessionStorage.removeItem('ytSyncReconnect');
    }
  } catch (e) {
    console.log('No reconnect needed');
  }
  
  injectFloatingWindow();
  connectToServer();
  observeVideoChanges();
}

function injectFloatingWindow() {
  if (floatingWindow) return;

  floatingWindow = document.createElement('div');
  floatingWindow.id = 'yt-sync-floating-window';
  floatingWindow.innerHTML = `
    <div class="yt-sync-header">
      <span class="yt-sync-title">🎵 YT Sync</span>
      <div class="yt-sync-controls">
        <button class="yt-sync-btn-minimize" title="Minimize">─</button>
        <button class="yt-sync-btn-close" title="Close">×</button>
      </div>
    </div>
    <div class="yt-sync-content">
      <div class="yt-sync-room-section" id="room-setup">
        <input type="text" id="username-input" placeholder="Your name" maxlength="20" />
        <div class="yt-sync-room-buttons">
          <button id="create-room-btn">Create Room</button>
          <button id="join-room-btn">Join Room</button>
        </div>
        <input type="text" id="room-code-input" placeholder="Enter room code" maxlength="6" style="display:none;" />
      </div>
      
      <div class="yt-sync-room-info" id="room-info" style="display:none;">
        <div class="yt-sync-room-header">
          <span>Room: <strong id="room-code-display"></strong></span>
          <button id="copy-code-btn" title="Copy code">📋</button>
          <span class="yt-sync-users">👥 <span id="user-count">0</span></span>
        </div>
        <div id="user-list" class="yt-sync-user-list"></div>
      </div>
      
      <div class="yt-sync-chat-section" id="chat-section" style="display:none;">
        <div class="yt-sync-chat-header">💬 Chat</div>
        <div class="yt-sync-chat-messages" id="chat-messages"></div>
        <div class="yt-sync-chat-input">
          <input type="text" id="chat-input" placeholder="Type message..." maxlength="500" />
          <button id="send-btn">Send</button>
        </div>
      </div>
      
      <div class="yt-sync-status">
        <span id="status-indicator">● <span id="status-text">Connecting...</span></span>
        <button id="leave-room-btn" style="display:none;">Leave Room</button>
      </div>
    </div>
  `;

  document.body.appendChild(floatingWindow);

  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['windowPosition'], (result) => {
        if (result && result.windowPosition) {
          floatingWindow.style.left = result.windowPosition.left;
          floatingWindow.style.top = result.windowPosition.top;
        }
      });
    }
  } catch (e) {
    console.log('Storage not available:', e);
  }

  setupFloatingWindowListeners();
  makeDraggable();
}

function setupFloatingWindowListeners() {
  const usernameInput = document.getElementById('username-input');
  usernameInput.value = username;
  usernameInput.addEventListener('input', (e) => {
    username = e.target.value || 'User';
  });

  document.getElementById('create-room-btn').addEventListener('click', async () => {
    try {
      await sendToServer('/create-room', { username });
    } catch (error) {
      showNotification('Failed to create room', 'error');
    }
  });

  document.getElementById('join-room-btn').addEventListener('click', async () => {
    const input = document.getElementById('room-code-input');
    if (input.style.display === 'none') {
      input.style.display = 'block';
      input.focus();
    } else {
      const roomCode = input.value.trim().toUpperCase();
      if (roomCode.length === 6) {
        try {
          await sendToServer('/join-room', { roomCode, username });
        } catch (error) {
          showNotification('Failed to join room', 'error');
        }
      }
    }
  });

  document.getElementById('copy-code-btn').addEventListener('click', () => {
    const code = document.getElementById('room-code-display').textContent;
    navigator.clipboard.writeText(code);
    showNotification('Room code copied!');
  });

  document.getElementById('leave-room-btn').addEventListener('click', async () => {
    await sendToServer('/leave-room', {});
    resetToSetup();
  });

  document.getElementById('send-btn').addEventListener('click', sendChatMessage);
  document.getElementById('chat-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });

  document.querySelector('.yt-sync-btn-minimize').addEventListener('click', () => {
    const content = document.querySelector('.yt-sync-content');
    if (content.style.display === 'none') {
      content.style.display = 'block';
      floatingWindow.classList.remove('minimized');
    } else {
      content.style.display = 'none';
      floatingWindow.classList.add('minimized');
    }
  });

  document.querySelector('.yt-sync-btn-close').addEventListener('click', async () => {
    if (inRoom) {
      if (confirm('You are in a room. Do you want to leave?')) {
        await sendToServer('/leave-room', {});
        cleanup();
        floatingWindow.remove();
        floatingWindow = null;
      }
    } else {
      cleanup();
      floatingWindow.remove();
      floatingWindow = null;
    }
  });
}

function makeDraggable() {
  const header = floatingWindow.querySelector('.yt-sync-header');
  let isDragging = false;
  let currentX, currentY, initialX, initialY;

  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('yt-sync-btn-minimize') || 
        e.target.classList.contains('yt-sync-btn-close')) {
      return;
    }
    
    isDragging = true;
    initialX = e.clientX - floatingWindow.offsetLeft;
    initialY = e.clientY - floatingWindow.offsetTop;
    header.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    floatingWindow.style.left = currentX + 'px';
    floatingWindow.style.top = currentY + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      header.style.cursor = 'grab';
      
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({
            windowPosition: {
              left: floatingWindow.style.left,
              top: floatingWindow.style.top
            }
          });
        }
      } catch (e) {
        console.log('Could not save position:', e);
      }
    }
  });
}

function observeVideoChanges() {
  let lastUrl = location.href;
  
  // Clean up existing observer
  if (mutationObserver) {
    mutationObserver.disconnect();
  }
  
  mutationObserver = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      handleVideoChange();
    }
  });
  
  mutationObserver.observe(document, { subtree: true, childList: true });
  handleVideoChange();
}

function handleVideoChange() {
  const videoId = getYouTubeVideoId();
  if (videoId && videoId !== currentVideoId) {
    currentVideoId = videoId;
    console.log('Video changed to:', videoId);
    
    // Clean up old listeners before attaching new ones
    cleanupPlayerListeners();
    
    setTimeout(() => {
      attachPlayerListeners();
      if (isHost && inRoom) {
        const timestamp = getPlayerTime();
        sendToServer('/video-changed', { videoId, timestamp });
      }
    }, 1000);
  }
}

function getYouTubeVideoId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('v');
}

// MEMORY LEAK FIX: Proper cleanup of event listeners
function cleanupPlayerListeners() {
  if (player && playerListeners) {
    console.log('🧹 Cleaning up old player listeners');
    Object.entries(playerListeners).forEach(([event, handler]) => {
      player.removeEventListener(event, handler);
    });
    playerListeners = null;
  }
}

function attachPlayerListeners() {
  player = document.querySelector('video');
  if (!player) {
    setTimeout(attachPlayerListeners, 500);
    return;
  }
  
  // Clean up any existing listeners first
  cleanupPlayerListeners();
  
  // Store references to the actual handler functions
  playerListeners = {
    play: handlePlay,
    pause: handlePause,
    seeked: handleSeek
  };
  
  // Attach listeners
  Object.entries(playerListeners).forEach(([event, handler]) => {
    player.addEventListener(event, handler);
  });
  
  console.log('🎬 Player listeners attached');
}

function handlePlay() {
  if (isSyncing || !isHost || !inRoom) return;
  console.log('▶️ Host: Play event');
  sendToServer('/play', { timestamp: getPlayerTime() });
}

function handlePause() {
  if (isSyncing || !isHost || !inRoom) return;
  console.log('⏸️ Host: Pause event');
  sendToServer('/pause', { timestamp: getPlayerTime() });
}

function handleSeek() {
  if (isSyncing || !isHost || !inRoom) return;
  console.log('⏩ Host: Seek event');
  sendToServer('/seek', { timestamp: getPlayerTime() });
}

function getPlayerTime() {
  return player ? player.currentTime : 0;
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();
  if (message && inRoom) {
    sendToServer('/send-message', { message });
    input.value = '';
  }
}

function updateConnectionStatus(connected) {
  const statusText = document.getElementById('status-text');
  const indicator = document.getElementById('status-indicator');
  if (statusText && indicator) {
    if (connected) {
      statusText.textContent = inRoom ? 'Connected' : 'Ready';
      indicator.style.color = '#4ade80';
    } else {
      statusText.textContent = 'Not connected';
      indicator.style.color = '#ef4444';
    }
  }
}

function handleRoomCreated(data) {
  isHost = true;
  inRoom = true;
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('room-info').style.display = 'block';
  document.getElementById('chat-section').style.display = 'block';
  document.getElementById('leave-room-btn').style.display = 'block';
  document.getElementById('room-code-display').textContent = data.roomCode;
  updateUserList(data.users);
  updateConnectionStatus(true);
  showNotification('Room created! Share code: ' + data.roomCode);
}

function handleRoomJoined(data) {
  isHost = false;
  inRoom = true;
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('room-info').style.display = 'block';
  document.getElementById('chat-section').style.display = 'block';
  document.getElementById('leave-room-btn').style.display = 'block';
  document.getElementById('room-code-display').textContent = data.roomCode;
  updateUserList(data.users);
  updateConnectionStatus(true);
  showNotification('Joined room: ' + data.roomCode);
  
  setTimeout(() => {
    restoreChatHistory();
  }, 100);
  
  if (data.currentVideo) {
    handleVideoChangedRemote(data.currentVideo);
  }
}

function handleUserJoined(data) {
  updateUserList(data.users);
  addSystemMessage(`${data.username} joined the room`);
}

function handleUserLeft(data) {
  updateUserList(data.users);
  addSystemMessage(`${data.username} left the room`);
}

function updateUserList(users) {
  document.getElementById('user-count').textContent = users.length;
  const userList = document.getElementById('user-list');
  userList.innerHTML = users.map(u => 
    `<div class="yt-sync-user">${u === username ? 'You' : u}</div>`
  ).join('');
}

function handleVideoChangedRemote(data) {
  if (isHost) return;
  const currentVideoId = getYouTubeVideoId();
  
  if (currentVideoId !== data.videoId) {
    saveChatHistory();
    
    try {
      sessionStorage.setItem('ytSyncReconnect', JSON.stringify({
        inRoom: true,
        username: username,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.log('Could not save state:', e);
    }
    
    window.location.href = `https://www.youtube.com/watch?v=${data.videoId}&t=${Math.floor(data.timestamp)}s`;
  } else {
    isSyncing = true;
    seekToTimestamp(data.timestamp);
    setTimeout(() => { isSyncing = false; }, 100);
  }
}

// SYNC FIX: Improved play synchronization with latency compensation
function handlePlayRemote(data) {
  if (isHost || !player) return;
  
  console.log(`📥 Received play command (timestamp: ${data.timestamp.toFixed(2)}s, latency: ${(estimatedLatency * 1000).toFixed(0)}ms)`);
  
  isSyncing = true;
  
  // Compensate for network latency + processing time
  const compensatedTime = data.timestamp + estimatedLatency + 0.05; // +50ms processing buffer
  
  // Seek to compensated position
  player.currentTime = compensatedTime;
  
  // Start playback immediately
  player.play()
    .then(() => {
      console.log(`✅ Playing at ${player.currentTime.toFixed(2)}s (target: ${compensatedTime.toFixed(2)}s)`);
      
      // Fine-tune sync after playback stabilizes
      setTimeout(() => {
        if (!player.paused && inRoom && !isHost) {
          const currentDrift = player.currentTime - compensatedTime - 0.1; // Account for elapsed time
          
          if (Math.abs(currentDrift) > 0.3) {
            console.log(`🔧 Adjusting drift: ${currentDrift.toFixed(2)}s`);
            player.currentTime = compensatedTime + 0.15; // Micro-adjustment
          }
        }
        isSyncing = false;
      }, 150);
    })
    .catch((err) => {
      console.error('❌ Autoplay blocked:', err);
      showNotification('Click video to enable sync', 'error');
      isSyncing = false;
    });
}

// SYNC FIX: Improved pause synchronization
function handlePauseRemote(data) {
  if (isHost || !player) return;
  
  console.log(`📥 Received pause command (timestamp: ${data.timestamp.toFixed(2)}s)`);
  
  isSyncing = true;
  
  // Compensate for network latency
  const compensatedTime = data.timestamp + estimatedLatency;
  
  // Seek first
  player.currentTime = compensatedTime;
  
  // Then pause
  setTimeout(() => {
    player.pause();
    console.log(`✅ Paused at ${player.currentTime.toFixed(2)}s`);
    
    // Final position correction after pause settles
    setTimeout(() => {
      player.currentTime = compensatedTime;
      isSyncing = false;
    }, 50);
  }, 30);
}

// SYNC FIX: Improved seek synchronization
function handleSeekRemote(data) {
  if (isHost || !player) return;
  
  console.log(`📥 Received seek command (timestamp: ${data.timestamp.toFixed(2)}s)`);
  
  isSyncing = true;
  
  // Compensate for network latency
  const compensatedTime = data.timestamp + estimatedLatency;
  
  seekToTimestamp(compensatedTime);
  
  setTimeout(() => { 
    isSyncing = false; 
  }, 150);
}

function seekToTimestamp(timestamp) {
  if (!player) return;
  
  const currentTime = player.currentTime;
  const drift = Math.abs(currentTime - timestamp);
  
  // More aggressive sync: seek if drift > 0.5 seconds
  if (drift > 0.5) {
    player.currentTime = timestamp;
    console.log(`⏩ Seeked to ${timestamp.toFixed(2)}s (drift: ${drift.toFixed(2)}s)`);
  } else {
    console.log(`✓ Drift acceptable: ${drift.toFixed(2)}s, no seek needed`);
  }
}

function addChatMessage(data) {
  const messages = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'yt-sync-message';
  const isOwn = data.username === username;
  messageDiv.innerHTML = `
    <span class="yt-sync-message-user">${isOwn ? 'You' : escapeHtml(data.username)}:</span>
    <span class="yt-sync-message-text">${escapeHtml(data.message)}</span>
  `;
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  saveChatHistory();
}

function addSystemMessage(text) {
  const messages = document.getElementById('chat-messages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'yt-sync-message yt-sync-system-message';
  messageDiv.textContent = text;
  messages.appendChild(messageDiv);
  messages.scrollTop = messages.scrollHeight;
  
  saveChatHistory();
}

function showNotification(text, type = 'info') {
  if (!floatingWindow) return;
  const notification = document.createElement('div');
  notification.className = `yt-sync-notification ${type}`;
  notification.textContent = text;
  floatingWindow.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function resetToSetup() {
  cleanup();
  
  isHost = false;
  inRoom = false;
  document.getElementById('room-setup').style.display = 'block';
  document.getElementById('room-info').style.display = 'none';
  document.getElementById('chat-section').style.display = 'none';
  document.getElementById('leave-room-btn').style.display = 'none';
  document.getElementById('room-code-input').value = '';
  document.getElementById('room-code-input').style.display = 'none';
  document.getElementById('chat-messages').innerHTML = '';
  
  try {
    sessionStorage.removeItem('ytSyncClientId');
    sessionStorage.removeItem('ytSyncReconnect');
    sessionStorage.removeItem('ytSyncChatHistory');
  } catch (e) {
    console.log('Could not clear session storage');
  }
  
  updateConnectionStatus(eventSource && eventSource.readyState === EventSource.OPEN);
}

// MEMORY LEAK FIX: Centralized cleanup function
function cleanup() {
  console.log('🧹 Cleaning up resources...');
  
  // Clean up player listeners
  cleanupPlayerListeners();
  
  // Clean up mutation observer
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
    console.log('🧹 Mutation observer cleaned up');
  }
  
  // Clean up event source
  if (eventSource) {
    eventSource.close();
    eventSource = null;
    console.log('🧹 Event source closed');
  }
  
  player = null;
  currentVideoId = null;
}

function saveChatHistory() {
  try {
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    
    const messageElements = messages.querySelectorAll('.yt-sync-message');
    const chatHistory = [];
    
    messageElements.forEach(msg => {
      const isSystem = msg.classList.contains('yt-sync-system-message');
      
      if (isSystem) {
        chatHistory.push({
          type: 'system',
          text: msg.textContent
        });
      } else {
        const userSpan = msg.querySelector('.yt-sync-message-user');
        const textSpan = msg.querySelector('.yt-sync-message-text');
        
        if (userSpan && textSpan) {
          chatHistory.push({
            type: 'message',
            username: userSpan.textContent.replace(':', '').trim(),
            message: textSpan.textContent
          });
        }
      }
    });
    
    const recentMessages = chatHistory.slice(-50);
    sessionStorage.setItem('ytSyncChatHistory', JSON.stringify(recentMessages));
    console.log('💾 Saved', recentMessages.length, 'chat messages');
  } catch (e) {
    console.log('Could not save chat history:', e);
  }
}

function restoreChatHistory() {
  try {
    const savedChat = sessionStorage.getItem('ytSyncChatHistory');
    if (!savedChat) return;
    
    const chatHistory = JSON.parse(savedChat);
    console.log('📜 Restoring', chatHistory.length, 'chat messages');
    
    const messages = document.getElementById('chat-messages');
    if (!messages) return;
    
    messages.innerHTML = '';
    
    chatHistory.forEach(msg => {
      if (msg.type === 'system') {
        addSystemMessage(msg.text);
      } else {
        addChatMessage({
          username: msg.username,
          message: msg.message
        });
      }
    });
    
    if (chatHistory.length > 0) {
      addSystemMessage('📜 Chat history restored');
    }
  } catch (e) {
    console.log('Could not restore chat history:', e);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  cleanup();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}