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
        if (confirm("⚠️ NUCLEAR OPTION ⚠️\n\n1. Wipe Local Keys (Memory)\n2. Delete All Messages\n3. Reload App")) {

            // 1. Wipe Memory
            roomKey = null;
            username = null;
            roomPassword = null;

            try {
                const snapshot = await db.collection('messages').get();
                const batch = db.batch();

                snapshot.docs.forEach((doc) => {
                    batch.delete(doc.ref);
                });

                await batch.commit();
                console.log("NUCLEAR WIPE COMPLETE.");

                // 3. Reload to clear any fragments
                window.location.reload();
            } catch (e) {
                window.location.reload(); // Reload anyway
            }
        }
    });

    // --- IMAGE HANDLING ---
    uploadBtn.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        addSystemMessage("PROCESSING IMAGE...");

        // 1. Compress & Base64
        const base64Img = await compressImage(file);

        // 2. Construct Payload
        const payloadObj = {
            user: username,
            content: base64Img,
            type: 'image',
            timestamp: Date.now()
        };

        // 3. Encrypt
        const payload = await encryptMessage(JSON.stringify(payloadObj));

        // 4. Send
        try {
            await db.collection('messages').add({
                user: "ANONYMOUS",
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

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    function base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }

    async function encryptMessage(text) {
        const enc = new TextEncoder();
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // Random IV
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            roomKey,
            enc.encode(text)
        );

        // Pack IV + Ciphertext for storage (Base64 optimized)
        return JSON.stringify({
            iv: arrayBufferToBase64(iv),
            data: arrayBufferToBase64(ciphertext)
        });
    }

    async function decryptMessage(packedJson) {
        try {
            const packed = JSON.parse(packedJson);
            let iv, data;

            // Handle Legacy (Array) vs New (Base64)
            if (Array.isArray(packed.iv)) {
                iv = new Uint8Array(packed.iv);
                data = new Uint8Array(packed.data);
            } else {
                iv = new Uint8Array(base64ToArrayBuffer(packed.iv));
                data = new Uint8Array(base64ToArrayBuffer(packed.data));
            }

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                roomKey,
                data
            );

            const decodedString = new TextDecoder().decode(decrypted);

            // Try to parse as JSON (New Protocol), fallback to string (Legacy)
            try {
                return JSON.parse(decodedString);
            } catch (e) {
                // Legacy: Payload was just string "Message" or "IMG:..."
                // Wrap in new object format for consistent handling
                return {
                    user: "UNKNOWN", // Encryption didn't hide user before
                    content: decodedString,
                    type: decodedString.startsWith("IMG:") ? "image" : "text"
                };
            }

        } catch (e) {
            console.error("Decryption failed:", e);
            return null; // Return null on failure logic
        }
    }

    const TTL_MS = 17 * 60 * 1000 + 40 * 1000; // 17m 40s (1060000 ms)

    // 4. Message Handler (Firestore Send)
    const sendMessage = async () => {
        const msgText = messageInput.value.trim();
        if (msgText.length > 0) {

            // Construct Payload with Metadata inside
            const payloadObj = {
                user: username,
                content: msgText,
                type: 'text',
                timestamp: Date.now() // Internal timestamp for verification
            };

            // Encrypt the JSON Payload
            const encryptedPayload = await encryptMessage(payloadObj);

            // Send to Firebase (Anonymous User Field)
            try {
                await db.collection('messages').add({
                    user: "ANONYMOUS", // Hide metadata
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
                            const decryptedObj = await decryptMessage(data.payload);

                            if (decryptedObj) {
                                // Extract user, content, type from the decrypted object
                                const user = decryptedObj.user || "UNKNOWN";
                                const content = decryptedObj.content;
                                const type = decryptedObj.type || 'text';

                                addMessage(user, content, type);
                            }
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

    function getUserColor(username) {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }

        // Colors: Neon Blue, Neon Red, Neon Orange, Neon Green (Default)
        const colors = ['#0088ff', '#ff3333', '#ffa500', '#0f0'];
        const index = Math.abs(hash % colors.length);
        return colors[index];
    }

    function addMessage(user, content, type) {
        const div = document.createElement('div');
        div.className = 'chat-msg';

        // Sanitize Username
        const safeUser = user.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const userColor = getUserColor(safeUser);
        const userSpan = `<span class="user" style="color: ${userColor}">[${safeUser}]</span>`;

        if (type === 'image') {
            div.innerHTML = `${userSpan} <br><img src="${content}" class="chat-img" onclick="window.open(this.src)">`;
        } else {
            // Sanitize Content or use textNode
            const textContent = document.createTextNode(" " + content);
            div.innerHTML = `${userSpan}`;
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
