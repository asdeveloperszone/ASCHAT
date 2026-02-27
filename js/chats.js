import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

let myID = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'auth.html'; return; }

  myID = localStorage.getItem('aschat_userID');
  if (myID && myID !== 'null') {
    renderChatList();
  }

  if (!myID || myID === 'null') {
    await loadMyID(user);
  } else {
    document.getElementById('myIDDisplay').textContent = myID + '@as';
  }

  // Save Google photo if not already saved
  if (user.photoURL) {
    const localPhoto = localStorage.getItem('aschat_photo');
    if (!localPhoto) {
      localStorage.setItem('aschat_photo', user.photoURL);
    }
  }

  listenForAllChats();
});

async function loadMyID(user) {
  try {
    const snapshot = await get(ref(db, 'userMap/' + user.uid));
    if (snapshot.exists()) {
      myID = snapshot.val();
      const userSnap = await get(ref(db, 'users/' + myID));
      if (userSnap.exists()) {
        localStorage.setItem('aschat_userID', myID);
        localStorage.setItem('aschat_name', userSnap.val().displayName);
        if (userSnap.val().photoURL) {
          localStorage.setItem('aschat_photo', userSnap.val().photoURL);
        }
      }
    }
  } catch (err) { console.error('Error loading ID:', err); }
  document.getElementById('myIDDisplay').textContent = myID ? myID + '@as' : 'Error';
}

function listenForAllChats() {
  if (!myID) return;
  onValue(ref(db, 'users'), (snapshot) => {
    if (!snapshot.exists()) return;
    const users = snapshot.val();
    Object.keys(users).forEach(uid => {
      if (uid === myID) return;
      const chatKey = getChatKey(myID, uid);
      listenToChatMessages(chatKey, uid, users[uid].displayName, users[uid].photoURL || null);
    });
  });
}

function listenToChatMessages(chatKey, otherID, otherName, otherPhoto) {
  onValue(ref(db, 'messages/' + chatKey), (snapshot) => {
    if (!snapshot.exists()) return;

    const messages = snapshot.val();
    const msgArray = Object.entries(messages).map(([key, val]) => ({ id: key, ...val }));
    const relevant = msgArray.filter(m => m.senderID === myID || m.receiverID === myID);
    if (relevant.length === 0) return;

    let contacts = JSON.parse(localStorage.getItem('aschat_contacts') || '{}');
    if (!contacts[otherID]) {
      contacts[otherID] = { name: otherName, userID: otherID, photo: otherPhoto };
      localStorage.setItem('aschat_contacts', JSON.stringify(contacts));
    } else if (otherPhoto && !contacts[otherID].photo) {
      contacts[otherID].photo = otherPhoto;
      localStorage.setItem('aschat_contacts', JSON.stringify(contacts));
    }

    const unread = relevant.filter(m => m.receiverID === myID && m.status !== 'seen').length;
    let unreadCounts = JSON.parse(localStorage.getItem('aschat_unread') || '{}');
    unreadCounts[otherID] = unread;
    localStorage.setItem('aschat_unread', JSON.stringify(unreadCounts));

    const localKey = 'chat_' + chatKey;
    let localMessages = JSON.parse(localStorage.getItem(localKey) || '[]');
    const localIDs = new Set(localMessages.map(m => m.id));
    let changed = false;

    relevant.forEach(msg => {
      if (!localIDs.has(msg.id)) {
        localMessages.push({
          id: msg.id,
          text: msg.text || null,
          audio: msg.audio || null,
          photo: msg.msgType === 'photo' ? msg.photo : null,
          msgType: msg.msgType || 'text',
          senderID: msg.senderID,
          status: msg.status || 'sent',
          timestamp: msg.timestamp || Date.now(),
          type: msg.senderID === myID ? 'sent' : 'received'
        });
        changed = true;
      }
    });

    if (changed) localStorage.setItem(localKey, JSON.stringify(localMessages));
    renderChatList();
  });
}

function renderChatList() {
  const contacts = JSON.parse(localStorage.getItem('aschat_contacts') || '{}');
  const unreadCounts = JSON.parse(localStorage.getItem('aschat_unread') || '{}');
  const chatsList = document.getElementById('chatsList');

  if (Object.keys(contacts).length === 0) {
    chatsList.innerHTML = '<p class="no-chats">No chats yet. Add someone to start!</p>';
    return;
  }

  const sorted = Object.values(contacts).sort((a, b) => {
    const aMsgs = JSON.parse(localStorage.getItem('chat_' + getChatKey(myID, a.userID)) || '[]');
    const bMsgs = JSON.parse(localStorage.getItem('chat_' + getChatKey(myID, b.userID)) || '[]');
    const aTime = aMsgs.length > 0 ? aMsgs[aMsgs.length - 1].timestamp : 0;
    const bTime = bMsgs.length > 0 ? bMsgs[bMsgs.length - 1].timestamp : 0;
    return bTime - aTime;
  });

  chatsList.innerHTML = '';

  sorted.forEach(contact => {
    const chatKey = getChatKey(myID, contact.userID);
    const messages = JSON.parse(localStorage.getItem('chat_' + chatKey) || '[]');
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const unread = unreadCounts[contact.userID] || 0;

    let lastMsgText = 'Tap to chat';
    if (lastMsg) {
      if (lastMsg.msgType === 'photo') lastMsgText = '📷 Photo';
      else if (lastMsg.msgType === 'audio') lastMsgText = '🎤 Voice message';
      else lastMsgText = lastMsg.text || 'Tap to chat';
    }

    const lastTime = lastMsg ? formatTime(lastMsg.timestamp) : '';

    const avatarHTML = contact.photo
      ? `<img src="${contact.photo}" class="chat-avatar-img" />`
      : `<div class="chat-avatar">${contact.name.charAt(0).toUpperCase()}</div>`;

    const item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = `
      ${avatarHTML}
      <div class="chat-info">
        <h4>${contact.name}</h4>
        <p class="${unread > 0 ? 'unread-preview' : ''}">${lastMsgText}</p>
      </div>
      <div class="chat-item-right">
        <span class="chat-time ${unread > 0 ? 'unread-time' : ''}">${lastTime}</span>
        ${unread > 0 ? `<span class="chat-unread">${unread}</span>` : ''}
      </div>
    `;
    item.onclick = () => {
      let unreadCounts = JSON.parse(localStorage.getItem('aschat_unread') || '{}');
      unreadCounts[contact.userID] = 0;
      localStorage.setItem('aschat_unread', JSON.stringify(unreadCounts));
      window.location.href = `chat.html?id=${contact.userID}&name=${encodeURIComponent(contact.name)}`;
    };
    chatsList.appendChild(item);
  });
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

function getChatKey(id1, id2) { return [id1, id2].sort().join('_'); }

window.copyID = function () {
  const id = localStorage.getItem('aschat_userID');
  if (!id || id === 'null') { alert('ID not loaded yet.'); return; }
  navigator.clipboard.writeText(id + '@as').then(() => alert('Your ID copied!'));
}

window.showAddUser = function () { document.getElementById('addUserModal').style.display = 'flex'; }

window.hideAddUser = function () {
  document.getElementById('addUserModal').style.display = 'none';
  document.getElementById('searchID').value = '';
  document.getElementById('searchError').textContent = '';
}

window.searchUser = async function () {
  const input = document.getElementById('searchID').value.trim();
  const errorMsg = document.getElementById('searchError');
  if (input.length !== 9 || isNaN(input)) { errorMsg.textContent = 'Please enter a valid 9-digit ID.'; return; }
  if (input === myID) { errorMsg.textContent = 'You cannot chat with yourself.'; return; }
  try {
    const snapshot = await get(ref(db, 'users/' + input));
    if (snapshot.exists()) {
      const userData = snapshot.val();
      let contacts = JSON.parse(localStorage.getItem('aschat_contacts') || '{}');
      contacts[input] = { name: userData.displayName, userID: input, photo: userData.photoURL || null };
      localStorage.setItem('aschat_contacts', JSON.stringify(contacts));
      hideAddUser();
      window.location.href = `chat.html?id=${input}&name=${encodeURIComponent(userData.displayName)}`;
    } else {
      errorMsg.textContent = 'User not found. Check the ID and try again.';
    }
  } catch (err) { errorMsg.textContent = 'Something went wrong. Try again.'; }
}

window.logoutUser = async function () {
  if (confirm('Are you sure you want to logout?')) {
    await signOut(auth);
    localStorage.clear();
    window.location.href = 'auth.html';
  }
}