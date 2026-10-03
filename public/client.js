const socket = io();
let me = null;
let currentTo = 'all';

document.getElementById('joinBtn').onclick = () => {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return alert('Isi nama dulu');
  socket.emit('join', { name });
};

socket.on('joined', (user) => {
  me = user;
  document.getElementById('login').classList.add('hidden');
  document.getElementById('chat').classList.remove('hidden');
  document.getElementById('status').textContent = 'Online';
});

socket.on('history', (msgs) => msgs.forEach(addMsg));
socket.on('new_message', addMsg);

socket.on('user_status', (u) => {
  // update list otomatis dari users_list
});

socket.on('users_list', (list) => {
  const ul = document.getElementById('usersList');
  ul.innerHTML = '';
  list.forEach(u => {
    if (u.id === me?.id) return;
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot ${u.status}"></span> ${u.name}`;
    li.onclick = () => {
      currentTo = u.id;
      document.getElementById('roomTitle').textContent = 'Chat dengan ' + u.name;
    };
    ul.appendChild(li);
  });
  // public
  const publicLi = document.createElement('li');
  publicLi.innerHTML = `<span class="dot online"></span> Public`;
  publicLi.onclick = () => {
    currentTo = 'all';
    document.getElementById('roomTitle').textContent = 'Public Chat';
  };
  ul.prepend(publicLi);
});

socket.on('typing', (data) => {
  document.getElementById('typing').textContent = data.name + ' sedang mengetik...';
  setTimeout(() => document.getElementById('typing').textContent = '', 2000);
});

socket.on('kicked', (msg) => {
  alert(msg);
  location.reload();
});

function addMsg(m) {
  const div = document.createElement('div');
  div.className = 'msg ' + (m.from === me?.id ? 'me' : '');
  div.innerHTML = `<b>${m.fromName}</b>: \( {m.text} <small> \){new Date(m.time).toLocaleTimeString()}</small>`;
  document.getElementById('messages').appendChild(div);
  document.getElementById('messages').scrollTop = 99999;
}

document.getElementById('sendBtn').onclick = send;
document.getElementById('msgInput').onkeypress = (e) => {
  if (e.key === 'Enter') send();
  socket.emit('typing', currentTo);
};

function send() {
  const text = document.getElementById('msgInput').value.trim();
  if (!text) return;
  socket.emit('send_message', { text, to: currentTo });
  document.getElementById('msgInput').value = '';
}
