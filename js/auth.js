import { auth, db, googleProvider } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import { ref, set, get, runTransaction } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-database.js";

// Check if already logged in
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await loadUserData(user);
      window.location.href = 'chats.html';
    } catch (err) {
      console.error('Error loading user:', err);
    }
  }
});

async function loadUserData(user) {
  let myID = localStorage.getItem('aschat_userID');
  
  if (!myID || myID === 'null') {
    // Try to get from userMap
    const snapshot = await get(ref(db, 'userMap/' + user.uid));
    if (snapshot.exists()) {
      myID = snapshot.val();
      const userSnap = await get(ref(db, 'users/' + myID));
      if (userSnap.exists()) {
        const userData = userSnap.val();
        localStorage.setItem('aschat_userID', myID);
        localStorage.setItem('aschat_name', userData.displayName);
        localStorage.setItem('aschat_uid', user.uid);
        if (userData.photoURL) {
          localStorage.setItem('aschat_photo', userData.photoURL);
        }
      }
    }
  }
}

// Generate unique 9-digit ID
async function generateUniqueUserID() {
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Generate 9-digit number (100000000 to 999999999)
    const userID = Math.floor(100000000 + Math.random() * 900000000).toString();
    
    // Check if ID already exists using transaction
    try {
      const result = await runTransaction(ref(db, 'users/' + userID), (currentData) => {
        if (currentData !== null) {
          return; // Abort transaction, ID exists
        }
        return { _temp: true }; // Temporary placeholder
      });
      
      if (result.committed) {
        // Remove temporary placeholder
        await set(ref(db, 'users/' + userID), null);
        return userID;
      }
    } catch (err) {
      // ID exists, try again
      attempts++;
    }
  }
  
  throw new Error('Could not generate unique user ID after ' + maxAttempts + ' attempts');
}

// Save user to database
async function saveUserToDB(uid, name, photoURL) {
  const userID = await generateUniqueUserID();
  
  // Save user data
  await set(ref(db, 'users/' + userID), {
    displayName: name,
    uid: uid,
    userID: userID,
    photoURL: photoURL || null,
    createdAt: Date.now()
  });
  
  // Save mapping
  await set(ref(db, 'userMap/' + uid), userID);
  
  return userID;
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

    const userID = await saveUserToDB(result.user.uid, name, null);

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
    await loadUserData(result.user);
    window.location.href = 'chats.html';
  } catch (err) {
    errorMsg.textContent = err.message;
  }
}

// Login with Google
window.loginWithGoogle = async function () {
  const errorMsg = document.getElementById('authError');
  
  try {
    errorMsg.textContent = 'Opening Google sign in...';
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    errorMsg.textContent = 'Setting up account...';
    
    // Check if user exists in userMap
    const snapshot = await get(ref(db, 'userMap/' + user.uid));
    let userID;

    if (snapshot.exists()) {
      // Existing user
      userID = snapshot.val();
      
      // Update photo if needed
      const userSnap = await get(ref(db, 'users/' + userID));
      if (userSnap.exists() && !userSnap.val().photoURL && user.photoURL) {
        await set(ref(db, 'users/' + userID + '/photoURL'), user.photoURL);
      }
    } else {
      // New Google user - generate unique ID
      errorMsg.textContent = 'Creating your unique 9-digit ID...';
      userID = await saveUserToDB(user.uid, user.displayName, user.photoURL);
    }

    // Load user data into localStorage
    const userSnap = await get(ref(db, 'users/' + userID));
    if (userSnap.exists()) {
      const userData = userSnap.val();
      localStorage.setItem('aschat_userID', userID);
      localStorage.setItem('aschat_name', userData.displayName);
      localStorage.setItem('aschat_uid', user.uid);
      if (userData.photoURL) {
        localStorage.setItem('aschat_photo', userData.photoURL);
      }
    }

    window.location.href = 'chats.html';
  } catch (err) {
    console.error('Google login error:', err);
    errorMsg.textContent = err.message || 'Failed to sign in with Google';
  }
    }
