const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

function load(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = load(USERS_FILE);
let messages = load(MESSAGES_FILE);

// online map: userId -> socketId
const online = new Map();

// Admin password sederhana (ganti sendiri)
const ADMIN_PASS = 'admin123';

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // User join
  socket.on('join', ({ name, isAdmin = false, password }) => {
    if (isAdmin && password !== ADMIN_PASS) {
      socket.emit('error', 'Wrong admin password');
      return;
    }

    let user = users.find(u => u.name === name);
    if (!user) {
      user = {
        id: uuidv4(),
        name,
        isAdmin: !!isAdmin,
        status: 'online',
        lastSeen: Date.now()
      };
      users.push(user);
      save(USERS_FILE, users);
    } else {
      user.status = 'online';
      user.lastSeen = Date.now();
      save(USERS_FILE, users);
    }

    socket.userId = user.id;
    socket.userName = user.name;
    socket.isAdmin = user.isAdmin;
    online.set(user.id, socket.id);

    // kirim history pesan
    const history = messages.filter(m =>
      m.to === 'all' || m.from === user.id || m.to === user.id
    );
    socket.emit('history', history);
    socket.emit('joined', user);

    // broadcast status
    io.emit('user_status', { id: user.id, name: user.name, status: 'online' });
    io.emit('users_list', getUsersList());
  });

  // Kirim pesan
  socket.on('send_message', (data) => {
    if (!socket.userId) return;

    const msg = {
      id: uuidv4(),
      from: socket.userId,
      fromName: socket.userName,
      to: data.to || 'all',          // 'all' = public, atau userId
      text: data.text,
      time: Date.now(),
      read: false
    };

    messages.push(msg);
    save(MESSAGES_FILE, messages);

    // kalau target online → langsung kirim
    if (msg.to === 'all') {
      io.emit('new_message', msg);
    } else {
      const targetSocket = online.get(msg.to);
      if (targetSocket) {
        io.to(targetSocket).emit('new_message', msg);
      }
      // pengirim juga dapat
      socket.emit('new_message', msg);
    }
  });

  // Typing
  socket.on('typing', (to) => {
    if (to === 'all') {
      socket.broadcast.emit('typing', { from: socket.userId, name: socket.userName });
    } else {
      const target = online.get(to);
      if (target) io.to(target).emit('typing', { from: socket.userId, name: socket.userName });
    }
  });

  // Admin: kick / ban
  socket.on('admin_kick', (userId) => {
    if (!socket.isAdmin) return;
    const targetSocket = online.get(userId);
    if (targetSocket) {
      io.to(targetSocket).emit('kicked', 'Kamu di-kick oleh admin');
      io.sockets.sockets.get(targetSocket)?.disconnect(true);
    }
  });

  // Admin: hapus pesan
  socket.on('admin_delete_msg', (msgId) => {
    if (!socket.isAdmin) return;
    messages = messages.filter(m => m.id !== msgId);
    save(MESSAGES_FILE, messages);
    io.emit('message_deleted', msgId);
  });

  // Disconnect → offline
  socket.on('disconnect', () => {
    if (socket.userId) {
      online.delete(socket.userId);
      const user = users.find(u => u.id === socket.userId);
      if (user) {
        user.status = 'offline';
        user.lastSeen = Date.now();
        save(USERS_FILE, users);
        io.emit('user_status', { id: user.id, name: user.name, status: 'offline', lastSeen: user.lastSeen });
        io.emit('users_list', getUsersList());
      }
    }
  });
});

function getUsersList() {
  return users.map(u => ({
    id: u.id,
    name: u.name,
    isAdmin: u.isAdmin,
    status: online.has(u.id) ? 'online' : 'offline',
    lastSeen: u.lastSeen
  }));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chat running → http://localhost:${PORT}`);
  console.log(`Admin panel → http://localhost:${PORT}/admin`);
});
