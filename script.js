// 1. Paste your Groq API key exactly between these quotes
const GROQ_API_KEY = "YOUR_GROQ_API_KEY";

// --- Global State ---
let chats = JSON.parse(localStorage.getItem('premium_bot_chats')) || [];
let activeChatId = null;
let isSoundEnabled = false;

let attachedImage = null;
let attachedText = null;
let attachedFileName = null;

// --- DOM Elements ---
const chatListEl = document.getElementById('chatList');
const chatHistoryEl = document.getElementById('chatHistory');
const userInput = document.getElementById('userInput');
const attachBtn = document.getElementById('attachBtn');
const fileUpload = document.getElementById('fileUpload');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const micBtn = document.getElementById('micBtn');

// --- Initialization ---
function init() {
    createNewChat();
}

function createNewChat() {
    const newChat = { id: Date.now(), title: `New Chat`, messages: [] };
    chats.unshift(newChat);
    activeChatId = newChat.id;
    saveData();
    updateUI();
}

function switchChat(id) {
    activeChatId = id;
    updateUI();
}

function deleteChat(id) {
    chats = chats.filter(chat => chat.id !== id);
    saveData();

    if (chats.length === 0) {
        createNewChat();
    } else if (id === activeChatId) {
        activeChatId = chats[0].id;
        updateUI();
    } else {
        updateUI();
    }
}

function saveData() { localStorage.setItem('premium_bot_chats', JSON.stringify(chats)); }

// --- UI Rendering & Markdown ---
function updateUI() {
    chatListEl.innerHTML = '';
    chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = `chat-item ${chat.id === activeChatId ? 'active' : ''}`;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.title;
        titleSpan.style.whiteSpace = 'nowrap';
        titleSpan.style.overflow = 'hidden';
        titleSpan.style.textOverflow = 'ellipsis';
        titleSpan.style.flexGrow = '1';

        const deleteBtn = document.createElement('span');
        deleteBtn.innerHTML = '&#128465;';
        deleteBtn.className = 'delete-btn';
        deleteBtn.title = 'Delete Chat';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        };

        div.appendChild(titleSpan);
        div.appendChild(deleteBtn);
        div.onclick = () => switchChat(chat.id);
        chatListEl.appendChild(div);
    });

    chatHistoryEl.innerHTML = '';
    const activeChat = chats.find(c => c.id === activeChatId);

    if (activeChat && activeChat.messages.length === 0) {
        chatHistoryEl.innerHTML = '<div class="message bot-message">Hello. I am ready to assist you. Upload files, speak, or type to begin.</div>';
        return;
    }

    if (activeChat) {
        activeChat.messages.forEach((msg, index) => {
            const isLastBotMsg = (index === activeChat.messages.length - 1) && (msg.sender === 'bot');
            appendMessageToDOM(msg.sender, msg.text, isLastBotMsg);
        });
    }
}

function appendMessageToDOM(sender, text, isLastBotMsg = false) {
    const msgContainer = document.createElement('div');
    msgContainer.className = `message ${sender === 'user' ? 'user-message' : 'bot-message'}`;

    const textDiv = document.createElement('div');

    if (sender === 'bot') {
        // Formats bullet points, code blocks, and bold text perfectly
        textDiv.innerHTML = marked.parse(text);
    } else {
        textDiv.textContent = text;
    }
    msgContainer.appendChild(textDiv);

    // Adds Copy and Regenerate buttons only to the AI's replies
    if (sender === 'bot') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-link';
        copyBtn.innerHTML = '📋 Copy';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = '✅ Copied!';
            setTimeout(() => { copyBtn.innerHTML = '📋 Copy'; }, 2000);
        };
        actionsDiv.appendChild(copyBtn);

        if (isLastBotMsg) {
            const regenBtn = document.createElement('button');
            regenBtn.className = 'action-link';
            regenBtn.innerHTML = '🔄 Regenerate';
            regenBtn.onclick = () => regenerateResponse();
            actionsDiv.appendChild(regenBtn);
        }

        msgContainer.appendChild(actionsDiv);
    }

    chatHistoryEl.appendChild(msgContainer);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

// --- Dynamic Features ---
async function regenerateResponse() {
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat || activeChat.messages.length < 2) return;

    activeChat.messages.pop();
    const lastUserMsg = activeChat.messages[activeChat.messages.length - 1].text;

    updateUI();
    await fetchAPI(lastUserMsg, null, null, activeChat);
}

soundToggleBtn.addEventListener('click', () => {
    isSoundEnabled = !isSoundEnabled;
    if (isSoundEnabled) {
        soundToggleBtn.textContent = '🔊 Sound On';
        soundToggleBtn.classList.add('sound-on');
    } else {
        soundToggleBtn.textContent = '🔇 Sound Off';
        soundToggleBtn.classList.remove('sound-on');
        window.speechSynthesis.cancel();
    }
});

function playAudioResponse(text) {
    const cleanText = text.replace(/[*#]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
}

// --- Voice and Attachments ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;

    recognition.onstart = function () {
        micBtn.classList.add('mic-active');
        userInput.placeholder = "Listening...";
    };

    recognition.onresult = function (event) {
        userInput.value = event.results[0][0].transcript;
        sendMessage();
    };

    recognition.onend = function () {
        micBtn.classList.remove('mic-active');
        userInput.placeholder = "Type a message or describe the attachment...";
    };
} else {
    micBtn.style.display = 'none';
}

micBtn.addEventListener('click', () => {
    if (recognition) recognition.start();
});

attachBtn.addEventListener('click', () => fileUpload.click());

fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    attachedFileName = file.name;
    attachBtn.classList.add('attachment-active');
    userInput.placeholder = `Attached: ${file.name} - Type a prompt...`;

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => { attachedImage = e.target.result; attachedText = null; };
        reader.readAsDataURL(file);
    } else {
        const reader = new FileReader();
        reader.onload = (e) => { attachedText = e.target.result; attachedImage = null; };
        reader.readAsText(file);
    }
});

// --- Message Sending ---
async function sendMessage() {
    const text = userInput.value.trim();
    if (!text && !attachedImage && !attachedText) return;

    const activeChat = chats.find(c => c.id === activeChatId);

    let userDisplayMessage = text;
    if (attachedFileName) {
        userDisplayMessage = `[Attached: ${attachedFileName}]\n${text}`;
    }

    if (activeChat.messages.length === 0) {
        activeChat.title = text.substring(0, 20) || attachedFileName.substring(0, 20) + '...';
    }

    activeChat.messages.push({ sender: 'user', text: userDisplayMessage });

    const payloadImage = attachedImage;
    const payloadText = attachedText;

    userInput.value = '';
    userInput.placeholder = "Type a message or describe the attachment...";
    attachBtn.classList.remove('attachment-active');
    attachedImage = null; attachedText = null; attachedFileName = null; fileUpload.value = '';

    updateUI();

    await fetchAPI(text, payloadImage, payloadText, activeChat);
}

// --- Direct Client-Side API Call ---
async function fetchAPI(text, imgData, fileData, activeChat) {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot-message';
    loadingDiv.textContent = "Analyzing...";
    chatHistoryEl.appendChild(loadingDiv);
    chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;

    const messages = [];
    activeChat.messages.forEach(msg => {
        if (msg.sender !== 'error' && msg.text !== text) {
            messages.push({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            });
        }
    });

    let currentContent = [];
    if (fileData) currentContent.push({ type: "text", text: `Attached Document Content:\n${fileData}` });
    if (text) currentContent.push({ type: "text", text: text });
    if (imgData) currentContent.push({ type: "image_url", image_url: { url: imgData } });

    messages.push({ role: "user", content: currentContent });

    const modelName = imgData ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: 0.7
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message);
        }

        const reply = data.choices[0].message.content;

        chatHistoryEl.removeChild(loadingDiv);
        activeChat.messages.push({ sender: 'bot', text: reply });
        saveData();
        updateUI();

        if (isSoundEnabled) {
            playAudioResponse(reply);
        }

    } catch (error) {
        chatHistoryEl.removeChild(loadingDiv);
        activeChat.messages.push({ sender: 'bot', text: `API Error: ${error.message}` });
        saveData();
        updateUI();
    }
}

// --- OS Native Sharing ---
document.getElementById('shareBtn').addEventListener('click', async () => {
    const activeChat = chats.find(c => c.id === activeChatId);
    if (!activeChat || activeChat.messages.length === 0) {
        alert("This chat is empty!");
        return;
    }

    let chatTranscript = "Check out my AI Conversation:\n\n";
    activeChat.messages.forEach(msg => {
        chatTranscript += `${msg.sender.toUpperCase()}:\n${msg.text}\n\n`;
    });

    if (navigator.share) {
        try {
            await navigator.share({
                title: activeChat.title,
                text: chatTranscript
            });
        } catch (err) {
            console.log("Share menu closed.");
        }
    } else {
        navigator.clipboard.writeText(chatTranscript);
        alert("Chat copied to your clipboard!");
    }
});

// --- Event Listeners ---
document.getElementById('sendBtn').addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

init();