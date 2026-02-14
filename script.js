document.addEventListener('DOMContentLoaded', () => {
    const introLayer = document.getElementById('intro-layer');
    const protectionLayer = document.getElementById('protection-layer');
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
    let roomKey = null; // Shared Secret (AES-GCM)
    let myKeyPair = null; // Ephemeral ECDH Key Pair
    let remotePublicKey = null; // Peer's Public Key
    let loginTime = 0; // Timestamp of when I joined

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
    // 0s - 3.5s: GHOST AMD Intro plays (CSS Animation)
    setTimeout(() => {
        // 3.5s: Intro fades out (handled by CSS forwards), Show Protection Layer
        protectionLayer.classList.remove('hidden');

        // Micro-delay ensures transition plays smoothly (prevents "snap")
        setTimeout(() => {
            protectionLayer.classList.add('visible');
        }, 50);

        // 2s Duration for Protection Splash
        setTimeout(() => {
            protectionLayer.classList.remove('visible');
            setTimeout(() => {
                protectionLayer.classList.add('hidden'); // Fully hide after fade
                loginLayer.classList.remove('hidden');   // Show Login
                usernameInput.focus();
            }, 500); // 0.5s fade out match
        }, 2000);

    }, 3500);

    // 2. Login Handler (Room Handshake)
    const handleLogin = async () => {
        const user = usernameInput.value.trim();
        const roomName = keyInput.value.trim().toUpperCase(); // "Key Code" input is now Room Name

        if (user.length > 0 && roomName.length > 0) {
            username = user;
            loginTime = Date.now(); // Mark session start

            try {
                addSystemMessage(`CONNECTING TO SECURE ROOM: ${roomName}...`);
                addSystemMessage("GENERATING EPHEMERAL KEYS...");
                myKeyPair = await generateKeyPair();

                // 1. Export my Public Key to JWK
                const exportedKey = await exportKey(myKeyPair.publicKey);

                // 2. Upload to Firestore: rooms/{roomName}/keys/{username}
                const roomRef = db.collection('rooms').doc(roomName).collection('keys');

                await roomRef.doc(username).set({
                    key: JSON.stringify(exportedKey),
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                loginLayer.classList.add('hidden');
                chatLayer.classList.remove('hidden');
                messageInput.focus();

                addSystemMessage(`IDENTITY VERIFIED: ${username}`);
                addSystemMessage(`WAITING FOR PEER HANDSHAKE...`);

                // 3. Listen for PEER keys
                roomRef.onSnapshot(async (snapshot) => {
                    snapshot.docChanges().forEach(async (change) => {
                        // Handle both NEW peers (added) and REFRESHED peers (modified)
                        if (change.type === "added" || change.type === "modified") {
                            const data = change.doc.data();
                            const peerName = change.doc.id;

                            // If it's NOT ME, it's a peer
                            if (peerName !== username) {
                                addSystemMessage(`PEER DETECTED: ${peerName}`);
                                addSystemMessage(`PERFORMING DIFFIE-HELLMAN KEY EXCHANGE...`);

                                try {
                                    const peerKeyJWK = JSON.parse(data.key);
                                    const peerKey = await importKey(peerKeyJWK);

                                    // DERIVE SHARED SECRET
                                    roomKey = await deriveSharedSecret(myKeyPair.privateKey, peerKey);

                                    addSystemMessage(`SECURE CHANNEL ESTABLISHED 🔒`);

                                    // Start Chat Listener (Now that we have a key)
                                    // Note: In a real app, we'd bind messages to this specific Room ID.
                                    // For this prototype, we are still using global messages but keyed encryption.
                                    // To make it ROBUST, we should filter messages by Room.
                                    // Let's keep it simple: ALL messages go to 'messages' collection, 
                                    // but only those with THIS key can be decrypted. 
                                    // Anyone else sees garbage.
                                    startChatListener();

                                } catch (err) {
                                    console.error("Handshake failed:", err);
                                    addSystemMessage("HANDSHAKE FAILED.");
                                }
                            }
                        }
                    });
                });

            } catch (err) {
                console.error(err);
                alert("CRITICAL ERROR: KEY GENERATION FAILED");
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
    // 3. Crypto Functions (Web Crypto API - ECDH)

    // Generate Ephemeral P-256 Key Pair
    async function generateKeyPair() {
        return window.crypto.subtle.generateKey(
            {
                name: "ECDH",
                namedCurve: "P-256"
            },
            true,
            ["deriveKey", "deriveBits"]
        );
    }

    // Export Key to JWK (JSON Web Key) for transport
    async function exportKey(key) {
        return window.crypto.subtle.exportKey("jwk", key);
    }

    // Import Key from JWK
    async function importKey(jwk) {
        return window.crypto.subtle.importKey(
            "jwk",
            jwk,
            {
                name: "ECDH",
                namedCurve: "P-256"
            },
            true,
            []
        );
    }

    // Derive Shared Secret (AES-GCM Key) from My Private + Peer Public
    async function deriveSharedSecret(privateKey, publicKey) {
        return window.crypto.subtle.deriveKey(
            {
                name: "ECDH",
                public: publicKey
            },
            privateKey,
            {
                name: "AES-GCM",
                length: 256
            },
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

            // SOFT FILTER: If message is old history, just ignore it (return null)
            // instead of showing "Undecryptable" error.
            if (packedJson) {
                try {
                    const tmp = JSON.parse(packedJson);
                    // We don't have timestamp here easily unless passed in, 
                    // but we can rely on the fact that if we just logged in, 
                    // and we can't decrypt it, it's probably history.
                    // Ideally we pass timestamp to decryptMessage.
                } catch (e) { }
            }

            // Better Approach: Handle this in the caller (startChatListener)
            // returning error object here is fine, caller decides to show it or not.
            return {
                user: "SYSTEM",
                content: "🔒 UNDECRYPTABLE MESSAGE (WRONG KEY)",
                type: "error"
            };
        }
    }

    const TTL_MS = 17 * 60 * 1000 + 40 * 1000; // 17m 40s (1060000 ms)

    // Helper: Check if message is from before I joined (Soft Filter)
    function isOldMessage(timestamp) {
        // If message timestamp is OLDER than my login time, it's history
        // Add 5s buffer for clock skew
        return timestamp < (loginTime - 5000);
    }

    // 4. Message Handler (Firestore Send)
    const sendMessage = async () => {
        const msgText = messageInput.value.trim();
        if (msgText.length > 0) {

            // UX: Disable Input
            messageInput.disabled = true;
            sendBtn.disabled = true;

            // Construct Payload with Metadata inside
            const payloadObj = {
                user: username,
                content: msgText,
                type: 'text',
                timestamp: Date.now() // Internal timestamp for verification
            };

            // Encrypt the JSON Payload
            const encryptedPayload = await encryptMessage(JSON.stringify(payloadObj));

            // Send to Firebase (Anonymous User Field)
            try {
                await db.collection('messages').add({
                    user: "ANONYMOUS", // Hide metadata
                    payload: encryptedPayload,
                    timestamp: Date.now()
                });
                messageInput.value = '';
            } catch (err) {
                // console.error("Transmission Error:", err); // Cleaned up
                addSystemMessage("TRANSMISSION FAILED.");
            } finally {
                // UX: Re-enable
                messageInput.disabled = false;
                sendBtn.disabled = false;
                messageInput.focus();
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
            // .where('timestamp', '>', loginTime) // Removed strict filter to avoid clock skew issues
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
                                // SOFT FILTER LOGIC:
                                // If error AND message is old -> Ignore
                                if (decryptedObj.type === 'error' && isOldMessage(data.timestamp)) {
                                    console.log("Ignoring old undecryptable message");
                                    return;
                                }

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

        // Colors: Cyber Cyan, Neon Purple, Bright Teal, White
        const colors = ['#00f3ff', '#bc13fe', '#00ff9d', '#ffffff'];
        const index = Math.abs(hash % colors.length);
        return colors[index];
    }

    function addMessage(user, content, type) {
        const div = document.createElement('div');

        // Determine alignment class
        const isSelf = (user === "YOU");
        div.className = isSelf ? 'chat-msg self' : 'chat-msg peer';

        // Sanitize Username
        const safeUser = user.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const userColor = getUserColor(safeUser);
        const userSpan = `<span class="user" style="color: ${userColor}">[${safeUser}]</span>`;

        if (type === 'image') {
            div.innerHTML = `${userSpan} <br><img src="${content}" class="chat-img" onclick="window.open(this.src)">`;
        } else if (type === 'error') {
            div.style.color = 'red';
            div.textContent = `> ${content}`;
        } else {
            // Sanitize Content or use textNode
            div.innerHTML = `${userSpan}`;
            const textNode = document.createTextNode(""); // Start empty
            div.appendChild(textNode);

            // Scramble Effect for new messages
            scrambleText(textNode, " " + content);
        }

        // --- PWA LOCAL NOTIFICATION ---
        if (document.hidden && Notification.permission === "granted" && user !== "YOU" && type !== 'error') {
            new Notification(`GHOST: ${safeUser}`, {
                body: "New Encrypted Transmission 🔒",
                icon: "icon-192.png",
                tag: "ghost-msg"
            });
        }

        chatWindow.appendChild(div);
        scrollToBottom();
    }

    function scrambleText(node, finalText) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*";
        // Use Array.from to correctly handle emojis (surrogate pairs)
        const finalTextArray = Array.from(finalText);
        const len = finalTextArray.length;

        // Fixed Duration: 1 Second (1000ms)
        const duration = 1000;
        const intervalTime = 30;
        const totalSteps = duration / intervalTime; // ~33 frames

        // Calculate how many characters to reveal per step
        // We need to reveal 'len' characters over 'totalSteps'
        const charsPerStep = len / totalSteps;

        let currentStep = 0;
        let revealedCount = 0;

        const interval = setInterval(() => {
            currentStep++;
            revealedCount += charsPerStep;

            let result = "";
            for (let i = 0; i < len; i++) {
                if (i < Math.floor(revealedCount)) {
                    result += finalTextArray[i];
                } else {
                    result += chars[Math.floor(Math.random() * chars.length)];
                }
            }
            node.textContent = result;

            // Keep scrolled to bottom during animation (important for mobile)
            // REMOVED: scrollToBottom() inside loop causes mobile jank
            // scrollToBottom(); 

            if (currentStep >= totalSteps) {
                clearInterval(interval);
                node.textContent = finalText; // Ensure clean finish
                scrollToBottom(); // Only scroll at the end
            }
        }, intervalTime);
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

    // FPS Loop
    let lastTime = 0;
    const fps = 48; // Doubled speed as requested (was 24)
    const interval = 1000 / fps;

    function matrix(currentTime) {
        requestAnimationFrame(matrix);

        const delta = currentTime - lastTime;
        if (delta < interval) return;

        lastTime = currentTime - (delta % interval);

        // Fade effect
        ctx.fillStyle = '#0001'; // Very translucent black to leave trails
        ctx.fillRect(0, 0, width, height);

        ctx.fillStyle = '#00f3ff'; // Cyber Cyan (was #0f0)
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

    requestAnimationFrame(matrix);

    // --- ANTI-SPY FEATURES ---

    // 1. Blur on Focus Loss
    window.addEventListener('blur', () => {
        document.body.style.filter = 'blur(10px) grayscale(100%)';
        document.title = 'Disconnected';
    });

    window.addEventListener('focus', () => {
        document.body.style.filter = 'none';
        document.title = 'GHOST';
    });

    // 2. Decoy Mode (Spreadsheet)
    let decoyMode = false;
    const decoyHTML = `
        <div id="decoy-overlay" style="position:fixed; inset:0; background:#fff; z-index:9999; font-family:Arial, sans-serif; color:#000; overflow-y:auto;">
            <div style="background:#217346; color:white; padding:10px; font-weight:bold; font-size:14px;">Excel - Annual_Report.xlsx</div>
            <div style="background:#f3f3f3; border-bottom:1px solid #ccc; padding:8px; display:flex; align-items:center;">
                <span style="display:inline-block; width:20px; text-align:center; color:#999; font-size:12px;">fx</span>
                <input type="text" value="=SUM(C2:C15)" style="width:100%; border:none; background:transparent; font-size:14px;">
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%; min-width:350px; border-collapse:collapse; font-size:12px;">
                    <tr style="background:#f3f3f3; text-align:center; color:#666;">
                        <td style="border:1px solid #ccc; width:30px;"></td>
                        <td style="border:1px solid #ccc; width:50px;">A</td>
                        <td style="border:1px solid #ccc; width:80px;">B</td>
                        <td style="border:1px solid #ccc; width:80px;">C</td>
                        <td style="border:1px solid #ccc; width:60px;">D</td>
                    </tr>
                    <!-- Responsive Rows -->
                    <tr>
                        <td style="background:#f3f3f3; border:1px solid #ccc; text-align:center;">1</td>
                        <td style="border:1px solid #eee; padding:4px;">Global</td>
                        <td style="border:1px solid #eee; padding:4px;">Q1 2025</td>
                        <td style="border:1px solid #eee; padding:4px;">Q2 2025</td>
                        <td style="border:1px solid #eee; padding:4px;">%</td>
                    </tr>
                    <tr>
                        <td style="background:#f3f3f3; border:1px solid #ccc; text-align:center;">2</td>
                        <td style="border:1px solid #eee; padding:4px;">Rev</td>
                        <td style="border:1px solid #eee; padding:4px;">$12k</td>
                        <td style="border:1px solid #eee; padding:4px;">$14k</td>
                        <td style="border:1px solid #eee; padding:4px; color:green;">+14%</td>
                    </tr>
                    <tr>
                        <td style="background:#f3f3f3; border:1px solid #ccc; text-align:center;">3</td>
                        <td style="border:1px solid #eee; padding:4px;">Exp</td>
                        <td style="border:1px solid #eee; padding:4px;">$8k</td>
                        <td style="border:1px solid #eee; padding:4px;">$8.5k</td>
                        <td style="border:1px solid #eee; padding:4px; color:red;">+5%</td>
                    </tr>
                     <tr>
                        <td style="background:#f3f3f3; border:1px solid #ccc; text-align:center;">4</td>
                         <td style="border:1px solid #eee; padding:4px;">Net</td>
                        <td style="border:1px solid #eee; padding:4px;">$4k</td>
                        <td style="border:1px solid #eee; padding:4px;">$5.7k</td>
                        <td style="border:1px solid #eee; padding:4px; color:green;">+31%</td>
                    </tr>
                </table>
            </div>
            <div style="padding:20px; text-align:center; color:#999; font-size:10px;">
                Sheet 1 | Sheet 2 | Sheet 3
            </div>
        </div>
    `;

    function toggleDecoy() {
        decoyMode = !decoyMode;
        if (decoyMode) {
            document.body.insertAdjacentHTML('beforeend', decoyHTML);
            document.title = 'Annual_Report.xlsx - Excel';
        } else {
            const decoy = document.getElementById('decoy-overlay');
            if (decoy) decoy.remove();
            document.title = 'GHOST';
        }
    }

    // Desktop: ESC Key
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleDecoy();
    });

    // Mobile: Triple Tap Gesture
    let tapCount = 0;
    let lastTapTime = 0;

    document.addEventListener('touchstart', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTapTime;

        if (tapLength < 500 && tapLength > 0) {
            tapCount++;
        } else {
            tapCount = 1;
        }

        lastTapTime = currentTime;

        if (tapCount === 3) {
            toggleDecoy();
            tapCount = 0; // Reset
        }
    });

    // --- PWA & NOTIFICATIONS SETUP ---
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => {
                console.log('SW Registered', reg);
                // Check if update found
                reg.onupdatefound = () => {
                    const installingWorker = reg.installing;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New content available, but waiting.
                            // We skipWaiting() in SW, so this might not be needed, but good for safety.
                            console.log("New update available");
                        }
                    };
                };
            })
            .catch(err => console.log('SW Fail', err));

        // Reload when new SW takes control (Auto-Update)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log("New SW active, reloading...");
            window.location.reload();
        });
    }

    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    }

    // Request on interaction
    usernameInput.addEventListener('focus', requestNotificationPermission);
    keyInput.addEventListener('focus', requestNotificationPermission);
});
