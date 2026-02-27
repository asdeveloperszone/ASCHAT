import { auth, db, googleProvider } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

// Check if already logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    let myID = localStorage.getItem('aschat_userID');
    if (!myID || myID === 'null') {
      try {
        const snapshot = await get(ref(db, 'userMap/' + user.uid));
        if (snapshot.exists()) {
          const userID = snapshot.val();
          const userSnap = await get(ref(db, 'users/' + userID));
          if (userSnap.exists()) {
            localStorage.setItem('aschat_userID', userID);
            localStorage.setItem('aschat_name', userSnap.val().displayName);
            localStorage.setItem('aschat_uid', user.uid);
            if (userSnap.val().photoURL) {
              localStorage.setItem('aschat_photo', userSnap.val().photoURL);
            }
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    window.location.href = 'chats.html';
  }
});

// Generate 9-digit unique ID
function generateUserID() {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
}

// Save user to database
async function saveUserToDB(uid, name, userID, photoURL) {
  await set(ref(db, 'users/' + userID), {
    displayName: name,
    uid: uid,
    userID: userID,
    photoURL: photoURL || null
  });
  await set(ref(db, 'userMap/' + uid), userID);
}

// Show Login Form
window.showLogin = function () {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('registerTab').classList.remove('active');
}

// Show Register Form
window.showRegister = function () {
  document.getElementById('registerForm').style.display = 'block';
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerTab').classList.add('active');
  document.getElementById('loginTab').classList.remove('active');
}

// Register with Email
window.registerUser = async function () {
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const errorMsg = document.getElementById('authError');

  if (!name || !email || !password) {
    errorMsg.textContent = 'Please fill all fields.';
    return;
  }

  try {
    errorMsg.textContent = 'Creating account...';
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });

    const userID = generateUserID();
    await saveUserToDB(result.user.uid, name, userID, null);

    localStorage.setItem('aschat_userID', userID);
    localStorage.setItem('aschat_name', name);
    localStorage.setItem('aschat_uid', result.user.uid);

    window.location.href = 'chats.html';
  } catch (err) {
    errorMsg.textContent = err.message;
  }
}

// Login with Email
window.loginUser = async function () {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const errorMsg = document.getElementById('authError');

  if (!email || !password) {
    errorMsg.textContent = 'Please fill all fields.';
    return;
  }

  try {
    errorMsg.textContent = 'Logging in...';
    const result = await signInWithEmailAndPassword(auth, email, password);
    const uid = result.user.uid;

    const snapshot = await get(ref(db, 'userMap/' + uid));
    if (snapshot.exists()) {
      const userID = snapshot.val();
      const userSnap = await get(ref(db, 'users/' + userID));
      if (userSnap.exists()) {
        const data = userSnap.val();
        localStorage.setItem('aschat_userID', userID);
        localStorage.setItem('aschat_name', data.displayName);
        localStorage.setItem('aschat_uid', uid);
        if (data.photoURL) {
          localStorage.setItem('aschat_photo', data.photoURL);
        }
      }
    }

    window.location.href = 'chats.html';
  } catch (err) {
    errorMsg.textContent = err.message;
  }
}

// Login with Google popup
window.loginWithGoogle = async function () {
  const errorMsg = document.getElementById('authError');
  try {
    errorMsg.textContent = 'Opening Google sign in...';
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    errorMsg.textContent = 'Setting up account...';
    const snapshot = await get(ref(db, 'userMap/' + user.uid));

    if (snapshot.exists()) {
      // Existing user
      const userID = snapshot.val();
      const userSnap = await get(ref(db, 'users/' + userID));
      if (userSnap.exists()) {
        const data = userSnap.val();
        localStorage.setItem('aschat_userID', userID);
        localStorage.setItem('aschat_name', data.displayName);
        localStorage.setItem('aschat_uid', user.uid);

        // Always update photo from Google if user hasn't set custom one
        if (!data.photoURL && user.photoURL) {
          // Save Google photo to Firebase
          await set(ref(db, 'users/' + userID + '/photoURL'), user.photoURL);
          localStorage.setItem('aschat_photo', user.photoURL);
        } else if (data.photoURL) {
          localStorage.setItem('aschat_photo', data.photoURL);
        }
      }
    } else {
      // New Google user
      const userID = generateUserID();
      await saveUserToDB(user.uid, user.displayName, userID, user.photoURL || null);
      localStorage.setItem('aschat_userID', userID);
      localStorage.setItem('aschat_name', user.displayName);
      localStorage.setItem('aschat_uid', user.uid);
      if (user.photoURL) {
        localStorage.setItem('aschat_photo', user.photoURL);
      }
    }

    window.location.href = 'chats.html';
  } catch (err) {
    errorMsg.textContent = err.message;
  }
}