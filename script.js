document.addEventListener('DOMContentLoaded', () => {
    const introLayer = document.getElementById('intro-layer');
    const loginLayer = document.getElementById('login-layer');
    const chatLayer = document.getElementById('chat-layer');
    const usernameInput = document.getElementById('username-input');
    const keyInput = document.getElementById('key-input');
    const messageInput = document.getElementById('message-input');
    const imageInput = document.getElementById('image-input');
    const uploadBtn = document.getElementById('upload-btn');
    const panicBtn = document.getElementById('panic-btn');
    const sendBtn = document.getElementById('send-btn');
    const chatWindow = document.getElementById('chat-window');

    let username = '';
    let roomKey = null;
    let roomPassword = '';

    // --- PANIC BUTTON ---
    // ...

    // --- PANIC BUTTON ---
    panicBtn.addEventListener('click', async () => {
        if (confirm("⚠️ NUCLEAR OPTION ⚠️\n\nDelete ALL messages in the database immediately?")) {
            const snapshot = await db.collection('messages').get();
            const batch = db.batch();

            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            console.log("NUCLEAR WIPE COMPLETE.");
            addSystemMessage("!!! PROTOCOL OMEGA EXECUTED. SYSTEM WIPED. !!!");
        }
    });

    // --- IMAGE HANDLING ---
    uploadBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        addSystemMessage("PROCESSING IMAGE...");

        // 1. Compress & Base64
        const base64 = await compressImage(file);

        // 2. Encrypt (Prefix with IMG:)
        const payload = await encryptMessage(`IMG:${base64}`);

        // 3. Send
        try {
            await db.collection('messages').add({
                user: username,
                payload: payload,
                timestamp: Date.now()
            });
            imageInput.value = ''; // Reset
        } catch (err) {
            console.error(err);
            addSystemMessage("IMAGE TRANSMISSION FAILED.");
        }
    });

    function compressImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 600;
                    const scaleSize = MAX_WIDTH / img.width;
                    const width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
                    const height = (img.width > MAX_WIDTH) ? (img.height * scaleSize) : img.height;

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Return compressed JPEG base64
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
            };
        });
    }

    // ... (Existing Code) ...

    // 1. Intro Sequence
    setTimeout(() => {
        loginLayer.classList.remove('hidden');
        usernameInput.focus();
    }, 3500);

    // 2. Login Handler (User & Key)
    const handleLogin = async () => {
        const user = usernameInput.value.trim();
        const pass = keyInput.value.trim();

        if (user.length > 0 && pass.length > 0) {
            username = user;
            roomPassword = pass;

            // Derive CryptoKey from Password
            try {
                roomKey = await deriveKey(pass);

                loginLayer.classList.add('hidden');
                chatLayer.classList.remove('hidden');
                messageInput.focus();

                addSystemMessage(`IDENTITY VERIFIED: ${username}`);
                addSystemMessage(`ENCRYPTION KEY GENERATED.`);
                addSystemMessage(`SECURE CHANNEL ESTABLISHED.`);

                // Start Firebase Listener
                startChatListener();
            } catch (err) {
                console.error(err);
                alert("ENCRYPTION FAILURE");
            }
        }
    };

    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') keyInput.focus();
    });

    keyInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // 3. Crypto Functions (Web Crypto API)
    async function deriveKey(password) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode("GHOST_CHAT_SALT"), // In prod, random salt is better, but strictly shared secret requires static salt or shared salt
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    }

    async function encryptMessage(text) {
        const enc = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Random IV
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            roomKey,
            enc.encode(text)
        );

        // Pack IV + Ciphertext for storage
        const ivArr = Array.from(iv);
        const ctArr = Array.from(new Uint8Array(ciphertext));
        return JSON.stringify({ iv: ivArr, data: ctArr });
    }

    async function decryptMessage(packedJson) {
        try {
            const packed = JSON.parse(packedJson);
            const iv = new Uint8Array(packed.iv);
            const data = new Uint8Array(packed.data);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                roomKey,
                data
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            return "[ENCRYPTED DATA]"; // Wrong key result
        }
    }

    const TTL_MS = 24 * 60 * 60 * 1000; // 24 Hours

    // 4. Message Handler (Firestore Send)
    const sendMessage = async () => {
        const msg = messageInput.value.trim();
        if (msg.length > 0) {
            // Encrypt
            const encryptedPayload = await encryptMessage(msg);

            // Send to Firebase
            try {
                await db.collection('messages').add({
                    user: username,
                    payload: encryptedPayload,
                    timestamp: Date.now()
                });
                messageInput.value = '';
                messageInput.focus();
            } catch (err) {
                console.error("Transmission Error:", err);
                addSystemMessage("TRANSMISSION FAILED.");
            }
        }
    };

    messageInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    sendBtn.addEventListener('click', sendMessage);

    // 5. Real-time Listener & Auto-Delete
    function startChatListener() {
        db.collection('messages')
            .orderBy('timestamp') // Ensure index exists in Firestore!
            .limitToLast(50)      // Only get recent messages
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === "added") {
                        const data = change.doc.data();
                        const timeDiff = Date.now() - data.timestamp;

                        // AUTO-DELETE CHECK (Hard Delete)
                        if (timeDiff > TTL_MS) {
                            // Message is too old. Delete it from DB.
                            // Only one client needs to trigger this, but it's safe if multiple do (idempotent)
                            db.collection('messages').doc(change.doc.id).delete()
                                .then(() => console.log(`Purged old message: ${change.doc.id}`))
                                .catch(err => console.log("Purge error", err));
                            return; // Do not display
                        }

                        // Display
                        if (data.payload) {
                            const decryptedText = await decryptMessage(data.payload);
                            addMessage(data.user, decryptedText);
                        }
                    }
                });
            }, (error) => {
                console.error("Scan Error:", error);
                addSystemMessage("CONNECTION LOST.");
            });
    }

    // Start listening immediately (or after login)
    // We'll hook this into handleLogin to avoid permission errors before auth if you add auth later


    function addSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.textContent = `> ${text}`;
        chatWindow.appendChild(div);
        scrollToBottom();
    }

    function addMessage(user, text) {
        const div = document.createElement('div');
        div.className = 'chat-msg';

        if (text.startsWith("IMG:")) {
            const imgSrc = text.substring(4); // Remove prefix
            div.innerHTML = `<span class="user">[${user}]</span> <br><img src="${imgSrc}" class="chat-img" onclick="window.open(this.src)">`;
        } else {
            // Securely escape text to prevent HTML injection (XSS)
            // (Wait, innerHTML was used before. For safety, let's use textContent for payload unless it's an image)
            // But to keep simple with bold user:
            const textContent = document.createTextNode(text);
            div.innerHTML = `<span class="user">[${user}]</span> `;
            div.appendChild(textContent);
        }

        chatWindow.appendChild(div);
        scrollToBottom();
    }

    function scrollToBottom() {
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // --- MATRIX RAIN EFFECT ---
    const canvas = document.getElementById('matrix-canvas');
    const ctx = canvas.getContext('2d');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    // Resize handler
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    });

    const cols = Math.floor(width / 20);
    const ypos = Array(cols).fill(0);

    function matrix() {
        // Fade effect
        ctx.fillStyle = '#0001'; // Very translucent black to leave trails
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#0f0';
        ctx.font = '15pt monospace';

        ypos.forEach((y, ind) => {
            const text = String.fromCharCode(Math.random() * 128);
            const x = ind * 20;
            ctx.fillText(text, x, y);

            // Random reset
            if (y > height && Math.random() > 0.975) {
                ypos[ind] = 0;
            } else {
                ypos[ind] = y + 20;
            }
        });
    }

    setInterval(matrix, 50);
});
