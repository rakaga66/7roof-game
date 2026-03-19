// ===== Color Map =====
const COLOR_MAP = {
    orange: { bg: '#FF9800', bgLight: '#FFB74D', border: '#E65100', text: '#fff' },
    purple: { bg: '#8B5FBF', bgLight: '#A07CC5', border: '#4A2570', text: '#fff' },
    red: { bg: '#EF4444', bgLight: '#F87171', border: '#B91C1C', text: '#fff' },
    blue: { bg: '#3B82F6', bgLight: '#60A5FA', border: '#1D4ED8', text: '#fff' },
    darkblue: { bg: '#1E3A8A', bgLight: '#3B82F6', border: '#172554', text: '#fff' },
    green: { bg: '#22C55E', bgLight: '#4ADE80', border: '#15803D', text: '#fff' },
    lightgreen: { bg: '#A3E635', bgLight: '#BEF264', border: '#4D7C0F', text: '#111' },
    yellow: { bg: '#EAB308', bgLight: '#FDE047', border: '#A16207', text: '#1a1a1a' },
    pink: { bg: '#F472B6', bgLight: '#F9A8D4', border: '#BE185D', text: '#fff' },
    cyan: { bg: '#2DD4BF', bgLight: '#5EEAD4', border: '#0F766E', text: '#fff' },
    charcoal: { bg: '#334155', bgLight: '#475569', border: '#0F172A', text: '#fff' },
    lightblue: { bg: '#7DD3FC', bgLight: '#BAE6FD', border: '#0284C7', text: '#111' }
};

const ROUND_WORDS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

// ===== Config =====
let BOARD_SIZE = 5;
const ARABIC_LETTERS = [
    'أ', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر',
    'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف',
    'ق', 'ك', 'ل', 'م', 'ن', 'هـ', 'و', 'ي'
];

// ===== Game State =====
let board = [];
let cellLetters = [];
let selectedCell = null;
let scores = { team1: 0, team2: 0 };

// Setup choices
let teamSetup = {
    competitionName: 'هوجاس',
    team1: { name: 'الفريق الأول', color: 'orange' },
    team2: { name: 'الفريق الثاني', color: 'purple' },
    totalRounds: 3,
    currentRound: 1,
    ansTime: 3,
    otherTime: 10,
    presenter: 'ai',
    sound: 'on',
    questionsSiteUrl: 'questions.html'
};

let timerInterval = null;
let currentTimerTeam = null;
let timeLeft = 0;


// ===== Questions System =====
let questionsBank = [];   // Array of { q: string, a: string }
let currentQIndex = -1;
let questionsLoaded = false;
const PDF_PATH = 'ملف الاساله/ملف الاسأله مرتبه ابجديا - اكثر من 500 سوال.pdf';

async function loadQuestionsFromPDF() {
    if (questionsLoaded) return;

    try {
        document.getElementById('sqLoading').style.display = 'flex';
        document.getElementById('sqQuestion').style.display = 'none';

        if (!window.pdfjsLib) {
            console.warn('PDF.js not available');
            return;
        }

        if (typeof pdfBase64Data === 'undefined') {
            console.error('PDF Data not found! Make sure pdfData.js is loaded.');
            return;
        }

        const raw = atob(pdfBase64Data);
        const uint8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
            uint8Array[i] = raw.charCodeAt(i);
        }
        const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const lines = content.items.map(item => item.str.trim()).filter(s => s.length > 0);
            fullText += lines.join('\n') + '\n';
        }

        // Parse Q&A pairs - smarter parsing for Arabic game files
        const parsedQs = [];
        const linesArr = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 1);

        let currentLetterGroup = '';

        for (let i = 0; i < linesArr.length; i++) {
            let line = linesArr[i];

            // Check if this line is a heading indicating a new letter group (e.g. "حرف الألف", "- حرف ب -")
            if (line.match(/(حرف|أسئلة)\s+([أ-ي])/i) || (line.length < 15 && line.includes('حرف'))) {
                let match = line.match(/(حرف\s+[أ-ي]+)/i);
                if (match) currentLetterGroup = match[1];
                continue; // Skip the heading line
            }

            let q = line;
            let a = '';

            // Try to split inline answers (e.g., "سؤال؟ ج: جواب")
            const inlineSplitters = [' ج:', ' ج :', ' ج/', ' ج /', ' الجواب:', ' الجواب:', ' الإجابة:', ' الاجابه:', '؟'];
            let foundInline = false;

            let qmIndex = q.indexOf('؟');
            if (qmIndex > -1 && qmIndex < q.length - 2) {
                a = q.substring(qmIndex + 1).trim();
                q = q.substring(0, qmIndex + 1).trim();
                a = a.replace(/^(ج|ج\.|ج\/|الجواب|الإجابة|الاجابه|Answer)[\s:\/\-]*/i, '').trim();
                foundInline = true;
            } else {
                for (let splitter of inlineSplitters) {
                    if (splitter === '؟') continue;
                    let sIdx = q.indexOf(splitter);
                    if (sIdx > -1) {
                        a = q.substring(sIdx + splitter.length).trim();
                        q = q.substring(0, sIdx).trim();
                        if (!q.endsWith('؟')) q += '؟';
                        foundInline = true;
                        break;
                    }
                }
            }

            // If no inline answer found, look at the next line
            if (!foundInline && i + 1 < linesArr.length) {
                let nextLine = linesArr[i + 1];
                const nextMarkers = ['ج', 'ج:', 'ج :', 'ج/', 'ج /', 'الجواب', 'الإجابة', 'الاجابه', 'Answer'];

                let isAnswer = false;
                for (let marker of nextMarkers) {
                    if (nextLine.startsWith(marker)) {
                        a = nextLine.substring(marker.length).replace(/^[\s:\/\-]+/, '').trim();
                        isAnswer = true;
                        break;
                    }
                }

                // If the next line is very short (1-5 words) and doesn't start with a question word, it might be an answer
                if (!isAnswer && nextLine.length < 35 && !nextLine.match(/^(س|هل|ماذا|ما|متى|كم|كيف|اين|أين|لماذا|اذكر)/)) {
                    a = nextLine;
                    isAnswer = true;
                }

                if (isAnswer) {
                    i++; // skip the next line since we consumed it as an answer
                }
            }

            // Clean up Question prefix (e.g. "1- ", "س/ ", "س: ")
            q = q.replace(/^(\d+[\-\.\)]|س[\/\:\-]|س\s+)/, '').trim();

            if (q.length > 5 && q.includes(' ')) {
                // Determine the letter for this question
                let derivedLetter = currentLetterGroup;

                if (!derivedLetter && a.length > 0) {
                    let firstWord = a.split(' ')[0].replace(/^(ال|و|ف|ب|ك)/, '');
                    if (firstWord.length > 0) {
                        derivedLetter = firstWord[0];
                    }
                }

                if (!derivedLetter) derivedLetter = 'عام';

                // Normalize Alef forms (أ, إ, آ => ا) to make matching robust
                const normalizeLetter = (l) => l.replace(/[أإآ]/g, 'ا');

                parsedQs.push({
                    q: q,
                    a: a,
                    letterMatch: normalizeLetter(derivedLetter)
                });
            }
        }

        questionsBank = parsedQs;
        questionsLoaded = true;

        document.getElementById('sqLoading').style.display = 'none';
        document.getElementById('sqQuestion').style.display = 'flex';

        console.log(`Loaded ${questionsBank.length} questions from PDF`);
    } catch (err) {
        console.error('Failed to load PDF:', err);
        document.getElementById('sqLoading').style.display = 'none';
        document.getElementById('sqQuestion').style.display = 'flex';
        document.getElementById('sqQuestion').textContent = '❌ خطأ في تحميل ملف الأسئلة';
    }
}

function showQuestionPanel(letter) {
    const panel = document.getElementById('sidebarQuestion');
    panel.style.display = 'flex';
    document.getElementById('sqAnswer').style.display = 'none';

    // Store requested letter globally so nextQuestion() knows it
    window.currentRequestedLetter = letter;

    // If already loaded, show a random question
    if (questionsLoaded && questionsBank.length > 0) {
        showRandomQuestion(letter);
    } else {
        // Load PDF first
        loadQuestionsFromPDF().then(() => {
            if (questionsBank.length > 0) {
                showRandomQuestion(letter);
            }
        });
    }
}

function showRandomQuestion(targetLetter) {
    if (questionsBank.length === 0) return;

    targetLetter = targetLetter || window.currentRequestedLetter;

    // Filter questions that match the target letter
    let normalizedTarget = targetLetter ? targetLetter.replace(/[أإآ]/g, 'ا') : '';
    let filteredQs = questionsBank;

    if (normalizedTarget) {
        let exactMatches = questionsBank.filter(q => {
            if (q.letterMatch && q.letterMatch.includes(normalizedTarget)) return true;

            // Fallback: check answer first letter
            if (q.a) {
                let cleanAnswer = q.a.replace(/^(ال|و|ف|ب|ك)/, '').trim();
                let ansFirstChar = cleanAnswer.length > 0 ? cleanAnswer[0].replace(/[أإآ]/g, 'ا') : '';
                if (ansFirstChar === normalizedTarget) return true;
            }
            return false;
        });

        if (exactMatches.length > 0) {
            filteredQs = exactMatches;
        }
    }

    // Pick a random question
    let newIdx;
    let attempts = 0;
    do {
        newIdx = Math.floor(Math.random() * filteredQs.length);
        attempts++;
    } while (filteredQs[newIdx] === questionsBank[currentQIndex] && filteredQs.length > 1 && attempts < 10);

    const qChosen = filteredQs[newIdx];
    currentQIndex = questionsBank.indexOf(qChosen);

    document.getElementById('sqQuestion').textContent = qChosen.q;

    if (qChosen.a) {
        document.getElementById('sqAnswerText').textContent = qChosen.a;
        document.getElementById('sqRevealBtn').style.display = 'block';
    } else {
        document.getElementById('sqAnswerText').textContent = "(عذراً، الإجابة غير متوفرة في الملف لهذا السؤال)";
        document.getElementById('sqRevealBtn').style.display = 'block'; // Or show it directly
    }

    document.getElementById('sqAnswer').style.display = 'none';

    let qTotalStr = filteredQs.length < questionsBank.length ? `(من ${filteredQs.length} سؤال لحرف ${targetLetter})` : ``;
    document.getElementById('sqNum').textContent = `سؤال عشوائي ${qTotalStr}`;
}

function revealAnswer() {
    document.getElementById('sqAnswer').style.display = 'block';
    document.getElementById('sqRevealBtn').style.display = 'none';
}

function nextQuestion() {
    document.getElementById('sqAnswer').style.display = 'none';
    showRandomQuestion();
}

function closeQuestionPanel() {
    document.getElementById('sidebarQuestion').style.display = 'none';
}

// ===== Screen Navigation =====
window.addEventListener('DOMContentLoaded', () => {
    initSettingsUI();
    initBuzzerParticipant();

    // إظهار شاشة البداية
    const homeScreen = document.getElementById('homeScreen');
    if (homeScreen) homeScreen.style.display = 'flex';

    // إخفاء السايدبار والمنطقة الرئيسية عند التحميل
    const sidebar = document.querySelector('.sidebar');
    const mainArea = document.querySelector('.main-area');
    if (sidebar) sidebar.style.display = 'none';
    if (mainArea) mainArea.style.display = 'none';

    // Attempt autoplay on load
    const bgMusic = document.getElementById('bgMusic');
    if (bgMusic && teamSetup.sound === 'on') {
        bgMusic.play().catch(e => console.log('Autoplay blocked prior to interaction', e));
    }
});


// Browsers restrict audio before interaction. 
// Play it on the very first click anywhere if sound is enabled.
let userHasInteracted = false;
document.addEventListener('click', (e) => {
    // 1. Check for bgMusic initialization
    if (!userHasInteracted) {
        userHasInteracted = true;
        const bgMusic = document.getElementById('bgMusic');
        if (bgMusic && teamSetup.sound === 'on' && bgMusic.paused) {
            bgMusic.play().catch(e => console.log(e));
        }
    }

    // 2. Play general click sound if sound is on
    if (teamSetup.sound === 'on') {
        const isTeamAssignBtn = e.target.closest('.pick-btn') && !e.target.closest('.pick-cancel');
        if (!isTeamAssignBtn) {
            const clickAudio = document.getElementById('clickSound');
            if (clickAudio) {
                clickAudio.currentTime = 0;
                clickAudio.play().catch(err => console.log('Click sound prevented', err));
            }
        }
    }
});

function showRules() {
    const rm = document.getElementById('rulesModal');
    if (rm) {
        rm.style.display = 'flex';
        rm.classList.add('animate-zoom-in');
        if (typeof playSound === 'function') playSound('clickSound');
    }
}

function closeRules() {
    const rm = document.getElementById('rulesModal');
    if (rm) {
        rm.style.display = 'none';
    }
}

// Attach to window for accessibility
window.showRules = showRules;
window.closeRules = closeRules;

function showSettings() {
    const pass = prompt('يرجى إدخال كلمة سر الإدارة لبدء التعديل:');
    if (pass !== 'Rr74417441@') {
        alert('كلمة السر غير صحيحة!');
        return;
    }

    // إخفاء الشاشات الأخرى
    document.getElementById('homeScreen').style.display = 'none';
    const mainArea = document.querySelector('.main-area');
    const sidebar = document.querySelector('.sidebar');
    if (mainArea) mainArea.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';

    // تعبئة القيم الحالية في الحقول فقط
    document.getElementById('setCompName').value = teamSetup.competitionName;
    document.getElementById('setTeam1Name').value = teamSetup.team1.name;
    document.getElementById('setTeam2Name').value = teamSetup.team2.name;

    document.getElementById('settingsScreen').style.display = 'flex';
}

function showHome() {
    document.getElementById('settingsScreen').style.display = 'none';
    document.getElementById('homeScreen').style.display = 'flex';
}

function saveSettings() {
    const cName = document.getElementById('setCompName').value.trim();
    if (cName) teamSetup.competitionName = cName;

    const t1Name = document.getElementById('setTeam1Name').value.trim();
    if (t1Name) teamSetup.team1.name = t1Name;

    const t2Name = document.getElementById('setTeam2Name').value.trim();
    if (t2Name) teamSetup.team2.name = t2Name;

    // تحديث اسم المسابقة فوراً في كل الشاشات
    document.querySelectorAll('.logo-line3').forEach(el => {
        el.textContent = teamSetup.competitionName;
    });

    // تحديث أسماء الفريقين في السايدبار
    const n1 = document.getElementById('name1');
    const n2 = document.getElementById('name2');
    if (n1) n1.textContent = teamSetup.team1.name;
    if (n2) n2.textContent = teamSetup.team2.name;

    // تحديث أزرار اختيار الفريق
    const pickBtn1 = document.getElementById('pickBtn1');
    const pickBtn2 = document.getElementById('pickBtn2');
    if (pickBtn1) pickBtn1.textContent = teamSetup.team1.name;
    if (pickBtn2) pickBtn2.textContent = teamSetup.team2.name;

    showHome();
}

function startGame() {
    document.getElementById('homeScreen').style.display = 'none';

    teamSetup.currentRound = 1;
    scores = { team1: 0, team2: 0 };

    document.getElementById('name1').textContent = teamSetup.team1.name;
    document.getElementById('name2').textContent = teamSetup.team2.name;

    const compName = teamSetup.competitionName;
    document.querySelector('.sidebar .logo').innerHTML = `
        <span class="logo-line1">حروف</span>
        <span class="logo-line2">مع</span>
        <span class="logo-line3">${compName}</span>
    `;

    applyTeamColors();
    updateBgGradient(COLOR_MAP[teamSetup.team1.color].bg, COLOR_MAP[teamSetup.team2.color].bg);

    initBoard();
    renderBoard();
    updateRoundDisplay();
    updateSidebar();

    showTransitionScreen(compName, getRoundWord(teamSetup.currentRound));
}

function getRoundWord(round) {
    const idx = (round - 1) % ROUND_WORDS.length;
    return ROUND_WORDS[idx];
}

function showTransitionScreen(compName, roundWord) {
    const ts = document.getElementById('transitionScreen');
    const tsc = document.getElementById('tsContent');
    const mainArea = document.querySelector('.main-area');
    const sidebar = document.querySelector('.sidebar');

    if (mainArea) mainArea.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    ts.style.display = 'flex';

    // Phase 1: Game Title
    tsc.innerHTML = `
        <div class="ts-logo">
            <span class="logo-line1">حروف</span>
            <span class="logo-line2">مع</span>
            <span class="logo-line3">${compName}</span>
        </div>
    `;
    tsc.className = 'ts-content animate-pop-in';

    // After 2 seconds, switch to Phase 2: Round Word
    setTimeout(() => {
        tsc.classList.remove('animate-pop-in');
        void tsc.offsetWidth; // trigger reflow

        tsc.innerHTML = `
            <div class="ts-round">
                <span class="ts-round-txt1">الجولة</span>
                <span class="ts-round-txt2">${roundWord}</span>
            </div>
        `;
        tsc.classList.add('animate-pop-in');

        // After 2 more seconds, hide transition and show main area
        setTimeout(() => {
            ts.style.display = 'none';
            if (mainArea) {
                mainArea.style.display = 'flex';
                if (sidebar) sidebar.style.display = 'flex';
                // Trigger any entry animation for the main area if needed

                // Pause intro music and play entry sound
                const bgMusic = document.getElementById('bgMusic');
                if (bgMusic) bgMusic.pause();

                if (teamSetup.sound === 'on') {
                    const enterAudio = document.getElementById('enterSound');
                    if (enterAudio) {
                        enterAudio.currentTime = 0;
                        enterAudio.play().catch(e => console.log('Enter sound prevented', e));
                    }
                }
            }
        }, 2000);
    }, 2000);
}

// ===== Game Menu (Dropdown) =====
function toggleGameMenu() {
    const menu = document.getElementById('gameDropdown');
    const isVisible = (menu.style.display === 'flex');
    menu.style.display = isVisible ? 'none' : 'flex';

    // If opening, check if human presenter is active to show extra options
    if (!isVisible) {
        const extra = document.getElementById('humanPresenterExtra');
        if (extra) {
            if (teamSetup.presenter === 'human') {
                extra.style.display = 'flex';
                generateQuestionsQr();
            } else {
                extra.style.display = 'none';
            }
        }
    }
}

function openQuestionsSite() {
    window.open(teamSetup.questionsSiteUrl, '_blank');
}

function generateQuestionsQr() {
    const container = document.getElementById('questionsQrContainer');
    if (!container) return;

    container.style.display = 'flex';
    if (container.innerHTML !== '') return; // Already generated

    const url = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1) + teamSetup.questionsSiteUrl;

    if (typeof QRCode !== 'undefined') {
        new QRCode(container, {
            text: url,
            width: 90,
            height: 90,
            colorDark: "#4A2570",
            colorLight: "#ffffff"
        });
    }
}

function copyBuzzerLink() {
    const code = document.getElementById('modalBuzzerCodeTxt').parentElement.dataset.code;
    const t1 = encodeURIComponent(teamSetup.team1.name);
    const t2 = encodeURIComponent(teamSetup.team2.name);
    const url = `https://buzzer-server-production-331c.up.railway.app/?room=${code}&team1=${t1}&team2=${t2}`;

    navigator.clipboard.writeText(url).then(() => {
        const btn = document.getElementById('copyBuzzerBtn');
        const oldText = btn.textContent;
        btn.textContent = 'تم النسخ! ✓';
        btn.style.background = '#4ADE80';
        setTimeout(() => {
            btn.textContent = oldText;
            btn.style.background = '#FFD600';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    const container = document.querySelector('.game-menu-container');
    const menu = document.getElementById('gameDropdown');
    if (container && menu && !container.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function setGamePresenter(type) {
    teamSetup.presenter = type;
    document.getElementById('gdToggleAi').classList.toggle('active', type === 'ai');
    document.getElementById('gdToggleHuman').classList.toggle('active', type === 'human');

    // Sync with main settings screen
    const mainSettingsGroups = document.querySelectorAll('#setPresenterGroup .toggle-btn');
    mainSettingsGroups.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === type);
    });
}

function resetGameGrid() {
    if (confirm('هل أنت متأكد من بدء لعبة جديدة؟')) {
        startGame();
        document.getElementById('gameDropdown').style.display = 'none';
    }
}

function playBell() {
    if (teamSetup.sound === 'off') return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start();
        oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
        console.log("Audio not supported");
    }
    document.getElementById('gameDropdown').style.display = 'none';
}

function toggleGameSound() {
    const isMuted = (teamSetup.sound === 'off');
    teamSetup.sound = isMuted ? 'on' : 'off';

    const bgMusic = document.getElementById('bgMusic');
    if (bgMusic) {
        if (teamSetup.sound === 'on') {
            bgMusic.play().catch(e => console.log(e));
        } else {
            bgMusic.pause();
        }
    }

    const btn = document.getElementById('gdMuteBtn');
    if (teamSetup.sound === 'on') {
        btn.innerHTML = '<span>إيقاف الصوت</span> 🔊';
    } else {
        btn.innerHTML = '<span>تشغيل الصوت</span> 🔇';
    }

    // Sync with main settings screen
    const mainSettingsGroups = document.querySelectorAll('#setSoundGroup .toggle-btn');
    mainSettingsGroups.forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.value === teamSetup.sound);
    });
}

// ===== Settings Init =====
let settingsUIInitialized = false;
function initSettingsUI() {
    // منع تكرار إضافة الـ listeners
    if (settingsUIInitialized) return;
    settingsUIInitialized = true;

    // Live update competition name in all logos
    const compNameInput = document.getElementById('setCompName');
    if (compNameInput) {
        compNameInput.addEventListener('input', (e) => {
            const newName = e.target.value.trim() || 'هوجاس';
            teamSetup.competitionName = newName;
            document.querySelectorAll('.logo-line3').forEach(el => {
                el.textContent = newName;
            });
        });
    }

    const setupGroups = ['setRoundsGroup', 'setPresenterGroup', 'setSoundGroup'];
    setupGroups.forEach(gid => {
        const group = document.getElementById(gid);
        if (!group) return;
        group.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');

                if (gid === 'setRoundsGroup') teamSetup.totalRounds = parseInt(btn.dataset.value);
                if (gid === 'setPresenterGroup') teamSetup.presenter = btn.dataset.value;
                if (gid === 'setSoundGroup') {
                    teamSetup.sound = btn.dataset.value;
                    const bgMusic = document.getElementById('bgMusic');
                    if (bgMusic && teamSetup.sound === 'off') {
                        bgMusic.pause();
                    }
                }
            });
        });
    });

    const colorsGrid = document.getElementById('setColorsGroup');
    if (colorsGrid) {
        colorsGrid.querySelectorAll('.color-pair').forEach(btn => {
            btn.addEventListener('click', () => {
                colorsGrid.querySelectorAll('.color-pair').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                teamSetup.team1.color = btn.dataset.c1;
                teamSetup.team2.color = btn.dataset.c2;
            });
        });
    }

    // Board Size Selection
    const boardSizeGroups = ['setBoardSizeGroup'];
    boardSizeGroups.forEach(gid => {
        const group = document.getElementById(gid);
        if (!group) return;
        group.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseInt(btn.dataset.value);
                BOARD_SIZE = val;

                // Sync all board size UI
                boardSizeGroups.forEach(id => {
                    const g = document.getElementById(id);
                    if (g) {
                        g.querySelectorAll('.toggle-btn').forEach(b => {
                            b.classList.toggle('selected', parseInt(b.dataset.value) === val);
                        });
                    }
                });
            });
        });
    });
    // Question Time Input Sync
    const timeInput = document.getElementById('setQuestionTime');
    if (timeInput) {
        timeInput.addEventListener('input', (e) => {
            teamSetup.otherTime = parseInt(e.target.value) || 10;
        });
    }
}

function adjTime(key, delta) {
    let val = teamSetup[key] + delta;
    if (key === 'ansTime' && val < 2) val = 2;
    if (key === 'ansTime' && val > 15) val = 15;
    if (key === 'otherTime' && val < 5) val = 5;
    if (key === 'otherTime' && val > 30) val = 30;

    teamSetup[key] = val;
    document.getElementById(key + 'Val').textContent = val;
}

// ===== Timer Logic =====
function startTimer(team, seconds, isSecondChance = false) {
    clearInterval(timerInterval);

    timeLeft = seconds;
    currentTimerTeam = team;

    const display = document.getElementById('timerDisplay');
    const teamSpan = document.getElementById('timerTeam');
    const secSpan = document.getElementById('timerSeconds');

    display.style.display = 'flex';
    display.classList.remove('danger');
    teamSpan.textContent = 'وقت ' + teamSetup[team].name + ':';
    secSpan.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        secSpan.textContent = timeLeft;

        if (timeLeft <= 3) {
            display.classList.add('danger');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            display.style.display = 'none';
            display.classList.remove('danger');

            if (!isSecondChance) {
                // Time's up for first team, give it to the other team
                const otherTeam = (team === 'team1') ? 'team2' : 'team1';
                startTimer(otherTeam, teamSetup.otherTime, true);
            } else {
                // Time's up for both teams -> cancel selection entirely
                showGameToast('مفتوح للجميع الاجابه لكن بالضغط');
                cancelSelect();
            }
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    const display = document.getElementById('timerDisplay');
    display.style.display = 'none';
    display.classList.remove('danger');
    currentTimerTeam = null;
}

// ===== Custom Toast Notification =====
function showGameToast(msg) {
    let toast = document.getElementById('gameToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'gameToast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');

    // Play the alert sound if sound is on
    if (teamSetup.sound === 'on') {
        const delAudio = document.getElementById('deleteSound');
        if (delAudio) {
            delAudio.currentTime = 0;
            delAudio.play().catch(e => console.log('Toast sound prevented', e));
        }
    }

    // Custom clear timeout to avoid overlap
    if (window.toastTimeout) clearTimeout(window.toastTimeout);
    window.toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// Live update team box accent colors + background in setup screen
function updateSetupPreview() {
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];
    const box1 = document.getElementById('setupTeam1');
    const box2 = document.getElementById('setupTeam2');
    if (box1) box1.style.borderColor = c1.bg;
    if (box2) box2.style.borderColor = c2.bg;

    // Update setup overlay background
    const overlay = document.getElementById('setupOverlay');
    if (overlay) {
        overlay.style.background = `linear-gradient(135deg, ${c1.border} 0%, #1e0a3c 40%, #1e0a3c 60%, ${c2.border} 100%)`;
    }

    // Update background for the game screen too (so it looks right on start)
    updateBgGradient(c1.bg, c2.bg);
}

function updateBgGradient(color1, color2) {
    const main = document.querySelector('.main-area');
    if (main) {
        main.style.background = `conic-gradient(
            from 0deg at 50% 50%,
            ${color2}  0deg  45deg,
            ${color1}  45deg 135deg,
            ${color2}  135deg 225deg,
            ${color1}  225deg 315deg,
            ${color2}  315deg 360deg
        )`;
    }
}

// ===== Start Game from Setup =====
function startGameFromSetup() {
    const n1 = document.getElementById('setupName1').value.trim();
    const n2 = document.getElementById('setupName2').value.trim();
    const err = document.getElementById('setupError');

    if (!n1 || !n2) {
        err.textContent = '⚠️ يرجى إدخال اسم كلا الفريقين';
        return;
    }
    if (teamSetup.team1.color === teamSetup.team2.color) {
        err.textContent = '⚠️ لا يمكن اختيار نفس اللون لكلا الفريقين';
        return;
    }
    err.textContent = '';

    teamSetup.team1.name = n1;
    teamSetup.team2.name = n2;
    teamSetup.currentRound = 1;
    scores = { team1: 0, team2: 0 };

    // Apply team colors to CSS variables
    applyTeamColors();
    updateBgGradient(COLOR_MAP[teamSetup.team1.color].bg, COLOR_MAP[teamSetup.team2.color].bg);

    // Hide setup overlay
    const overlay = document.getElementById('setupOverlay');
    overlay.classList.add('fade-out');
    setTimeout(() => { overlay.style.display = 'none'; }, 400);

    // Init game
    initBoard();
    renderBoard();
    updateRoundDisplay();
    updateSidebar();
}

// ===== Apply Dynamic Team Colors =====
function applyTeamColors() {
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];
    const root = document.documentElement;

    root.style.setProperty('--team1-bg', c1.bg);
    root.style.setProperty('--team1-light', c1.bgLight);
    root.style.setProperty('--team1-border', c1.border);
    root.style.setProperty('--team1-text', c1.text);
    root.style.setProperty('--team2-bg', c2.bg);
    root.style.setProperty('--team2-light', c2.bgLight);
    root.style.setProperty('--team2-border', c2.border);
    root.style.setProperty('--team2-text', c2.text);

    // Score boxes
    const sb1 = document.getElementById('scoreBox1');
    const sb2 = document.getElementById('scoreBox2');
    sb1.style.background = c1.bg;
    sb2.style.background = c2.bg;

    // Pick buttons
    const pb1 = document.getElementById('pickBtn1');
    const pb2 = document.getElementById('pickBtn2');
    pb1.textContent = teamSetup.team1.name;
    pb1.style.background = c1.bg;
    pb1.style.color = c1.text;
    pb2.textContent = teamSetup.team2.name;
    pb2.style.background = c2.bg;
    pb2.style.color = c2.text;
}

// ===== Update Sidebar =====
function updateSidebar() {
    document.getElementById('name1').textContent = teamSetup.team1.name;
    document.getElementById('name2').textContent = teamSetup.team2.name;
    document.getElementById('score1').textContent = scores.team1;
    document.getElementById('score2').textContent = scores.team2;
}

// ===== Round Display =====
function updateRoundDisplay() {
    const idx = (teamSetup.currentRound - 1) % ROUND_WORDS.length;
    document.getElementById('roundText').textContent = ROUND_WORDS[idx];
    document.getElementById('roundTotal').textContent =
        '(' + teamSetup.currentRound + '/' + teamSetup.totalRounds + ')';
}

// ===== Shuffle Board (only unclaimed) =====
function shuffleBoard() {
    const unclaimed = [];
    const letters = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (!board[r][c]) {
                unclaimed.push([r, c]);
                letters.push(cellLetters[r][c]);
            }
        }
    }
    shuffleArray(letters);
    unclaimed.forEach(([r, c], i) => {
        cellLetters[r][c] = letters[i];
    });
    renderBoard();
    cancelSelect();
}

// ===== Init Board =====
function initBoard() {
    board = [];
    cellLetters = [];
    const letters = [...ARABIC_LETTERS];
    shuffleArray(letters);
    let idx = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        board[r] = [];
        cellLetters[r] = [];
        for (let c = 0; c < BOARD_SIZE; c++) {
            board[r][c] = 0;
            cellLetters[r][c] = letters[idx % letters.length];
            idx++;
        }
    }
}

// ===== Render Board =====
function renderBoard() {
    const container = document.getElementById('boardContainer');
    container.innerHTML = '';

    // Add size-specific class for CSS scaling
    container.className = 'board-container board-size-' + BOARD_SIZE;

    const hexW = getHexSize();
    const hexH = hexW * 1.1547;
    const horizStep = hexW;
    const vertStep = hexH * 0.75;
    const rowOffsetX = hexW / 2;

    const totalW = (BOARD_SIZE - 1) * horizStep + hexW + rowOffsetX;
    const totalH = (BOARD_SIZE - 1) * vertStep + hexH;

    // Frame the board with board-bg
    const boardBg = document.querySelector('.board-bg');
    if (boardBg) {
        boardBg.style.width = (totalW + 60) + 'px'; // Add padding for frame
        boardBg.style.height = (totalH + 60) + 'px';
        boardBg.style.left = (totalW / 2 + 10) + 'px'; // Center base
        boardBg.style.top = (totalH / 2 + 30) + 'px';
        boardBg.style.transform = 'translate(-50%, -50%)';
    }

    container.style.width = totalW + 'px';
    container.style.height = totalH + 'px';

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const x = c * horizStep + (r % 2 === 1 ? rowOffsetX : 0);
            const y = r * vertStep;

            const cell = document.createElement('div');
            cell.className = 'hex-cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.style.left = x + 'px';
            cell.style.top = y + 'px';
            cell.style.width = hexW + 'px';
            cell.style.height = hexH + 'px';

            const border = document.createElement('div');
            border.className = 'hex-border';

            const shape = document.createElement('div');
            shape.className = 'hex-shape';

            const letter = document.createElement('span');
            letter.className = 'hex-letter';
            letter.textContent = cellLetters[r][c] || '';

            shape.appendChild(letter);
            cell.appendChild(border);
            cell.appendChild(shape);

            if (board[r][c]) {
                cell.classList.add('team-' + board[r][c]);
            }

            cell.addEventListener('click', () => onHexClick(r, c, cell));
            container.appendChild(cell);
        }
    }
}

// ===== Hex Click =====
function onHexClick(row, col, cellEl) {
    if (selectedCell) {
        selectedCell.el.classList.remove('selected');
    }

    cellEl.classList.add('selected');
    selectedCell = { row, col, el: cellEl };
    document.getElementById('teamPicker').style.display = 'flex';

    // Only start timer if the cell is unclaimed
    if (board[row][col] === 0) {
        // Timer no longer starts on click - it starts on BUZZER press
        // startTimer('team1', teamSetup.ansTime, false);

        // Show question panel in AI presenter mode
        if (teamSetup.presenter === 'ai') {
            const targetedLetter = cellLetters[row][col];
            showQuestionPanel(targetedLetter);
        } else if (teamSetup.presenter === 'human') {
            const targetedLetter = cellLetters[row][col];
            localStorage.setItem('7roof_current_letter', targetedLetter);
            localStorage.setItem('7roof_update_trigger', Date.now()); // Force update for polling if needed
        }
    } else {
        // If already claimed, ensure timer is stopped so it doesn't run while we consider unclaiming
        stopTimer();
    }
}

// ===== Unclaim Cell =====
function unclaimCell() {
    if (!selectedCell) return;

    const { row, col, el } = selectedCell;
    const currentTeam = board[row][col];

    // Only play delete sound and adjust score if it was actually claimed
    if (currentTeam !== 0) {
        if (teamSetup.sound === 'on') {
            const delAudio = document.getElementById('deleteSound');
            if (delAudio) {
                delAudio.currentTime = 0;
                delAudio.play().catch(err => console.log('Delete sound prevented', err));
            }
        }

        // Remove from current team
        el.classList.remove('team-' + currentTeam, 'claimed');
        if (scores[currentTeam] > 0) scores[currentTeam]--;

        board[row][col] = 0;
        updateScoreBoard();
    }

    stopTimer();
    el.classList.remove('selected');
    document.getElementById('teamPicker').style.display = 'none';
    selectedCell = null;

    // Unlock buzzers if we are connected
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock();
}

// ===== Assign Team =====
function assignTeam(team) {
    if (!selectedCell) return;

    // Play correct answer sound
    if (teamSetup.sound === 'on') {
        const corrAudio = document.getElementById('correctSound');
        if (corrAudio) {
            corrAudio.currentTime = 0;
            corrAudio.play().catch(err => console.log('Correct sound prevented', err));
        }
    }

    stopTimer();

    const { row, col, el } = selectedCell;

    el.classList.remove('selected');
    el.classList.add('team-' + team);
    board[row][col] = team;

    // Unlock buzzers when a team is officially assigned
    if (typeof clearBuzzerLock === 'function') clearBuzzerLock();

    // Score incremented only on round win (not per cell)

    selectedCell = null;
    document.getElementById('teamPicker').style.display = 'none';

    // Check win for this team
    if (checkWin(team)) {
        highlightWinPath(team);
        setTimeout(() => showRoundWin(team), 600);
        return;
    }

    // Check if all cells claimed → next round
    if (isBoardFull()) {
        setTimeout(handleRoundEnd, 500);
    }
}

// ===== Cancel =====
function cancelSelect() {
    stopTimer();
    if (selectedCell) {
        selectedCell.el.classList.remove('selected');
        selectedCell = null;
    }
    document.getElementById('teamPicker').style.display = 'none';
}

// ===== Hex Neighbors (pointy-top, row-offset grid) =====
// Even rows: normal x,  odd rows: shifted right by half hex
function getNeighbors(r, c) {
    const odd = (r % 2 === 1);
    return [
        [r, c - 1],
        [r, c + 1],
        [r - 1, odd ? c : c - 1],
        [r - 1, odd ? c + 1 : c],
        [r + 1, odd ? c : c - 1],
        [r + 1, odd ? c + 1 : c],
    ].filter(([nr, nc]) =>
        nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE
    );
}

// ===== BFS Win Check =====
// team1 wins: col 0 → col BOARD_SIZE-1  (left edge to right edge)
// team2 wins: row 0 → row BOARD_SIZE-1  (top edge to bottom edge)
function checkWin(team) {
    const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const queue = [];

    if (team === 'team1') {
        // Start from left column (col 0)
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (board[r][0] === team) {
                queue.push([r, 0]);
                visited[r][0] = true;
            }
        }
        while (queue.length > 0) {
            const [r, c] = queue.shift();
            if (c === BOARD_SIZE - 1) return true; // reached right column
            for (const [nr, nc] of getNeighbors(r, c)) {
                if (!visited[nr][nc] && board[nr][nc] === team) {
                    visited[nr][nc] = true;
                    queue.push([nr, nc]);
                }
            }
        }
    } else {
        // Start from top row (row 0)
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[0][c] === team) {
                queue.push([0, c]);
                visited[0][c] = true;
            }
        }
        while (queue.length > 0) {
            const [r, c] = queue.shift();
            if (r === BOARD_SIZE - 1) return true; // reached bottom row
            for (const [nr, nc] of getNeighbors(r, c)) {
                if (!visited[nr][nc] && board[nr][nc] === team) {
                    visited[nr][nc] = true;
                    queue.push([nr, nc]);
                }
            }
        }
    }
    return false;
}

// ===== Highlight Winning Path =====
function highlightWinPath(team) {
    const visited = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
    const parent = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
    const queue = [];

    if (team === 'team1') {
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (board[r][0] === team) { queue.push([r, 0]); visited[r][0] = true; }
        }
    } else {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (board[0][c] === team) { queue.push([0, c]); visited[0][c] = true; }
        }
    }

    let goal = null;
    while (queue.length > 0) {
        const [r, c] = queue.shift();
        if ((team === 'team1' && c === BOARD_SIZE - 1) ||
            (team === 'team2' && r === BOARD_SIZE - 1)) {
            goal = [r, c]; break;
        }
        for (const [nr, nc] of getNeighbors(r, c)) {
            if (!visited[nr][nc] && board[nr][nc] === team) {
                visited[nr][nc] = true;
                parent[nr][nc] = [r, c];
                queue.push([nr, nc]);
            }
        }
    }

    if (goal) {
        let [r, c] = goal;
        while (r !== null && c !== null) {
            const el = document.querySelector(`.hex-cell[data-row="${r}"][data-col="${c}"]`);
            if (el) el.classList.add('win-path');
            const p = parent[r][c];
            if (!p) break;
            [r, c] = p;
        }
    }
}

// ===== Show Round Win (one team connected!) =====
function showRoundWin(team) {
    // +1 point for winning this round
    if (teamSetup[team]) teamSetup[team].score = (teamSetup[team].score || 0) + 1;
    if (team === 'team1') document.getElementById('score1').textContent = teamSetup.team1.score || 0;
    else document.getElementById('score2').textContent = teamSetup.team2.score || 0;

    const t = team === 'team1' ? teamSetup.team1 : teamSetup.team2;
    const c = COLOR_MAP[t.color];

    const isLastRound = teamSetup.currentRound >= teamSetup.totalRounds;
    const btnText = isLastRound ? '🏆 النتيجة النهائية' : '➡️ الجولة التالية';
    const btnAction = isLastRound ? 'showFinalFromRound()' : 'nextRound()';

    const html = `
        <div id="roundWinOverlay" class="transition-screen" style="background: rgba(0, 0, 0, 0.85); z-index: 9998;">
            <div class="hex-bg-pattern"></div>
            <div class="ts-content animate-zoom-in">
                <div class="ts-round">
                    <span class="ts-round-txt1 animate-fade-up" style="color: #FFD600; margin-bottom: 5px; font-size: 3rem;">مبرووووك</span>
                    <span class="ts-round-txt2 animate-fade-up" style="color: #fff; margin-bottom: 20px; font-size: 1.5rem; opacity: 0.8;">الفائز بالجولة الحالية</span>
                    <span class="animate-zoom-in" style="
                        font-family: 'Lalezar', sans-serif;
                        font-size: 8rem;
                        color: ${c.bg};
                        -webkit-text-stroke: 3px #fff;
                        text-shadow: 0 0 30px ${c.bg};
                        margin-bottom: 40px;
                        line-height: 1;
                    ">${t.name}</span>
                    
                    <button onclick="${btnAction}" class="animate-fade-up" style="
                        font-family: 'Cairo', sans-serif;
                        font-size: 1.6rem;
                        padding: 16px 48px;
                        border: none;
                        border-radius: 50px;
                        background: #FFD600;
                        color: #1a1a1a;
                        cursor: pointer;
                        font-weight: bold;
                        box-shadow: 0 8px 30px rgba(255,214,0,0.4);
                        transition: all 0.3s;
                    " onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 12px 40px rgba(255,214,0,0.6)';" 
                       onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 8px 30px rgba(255,214,0,0.4)';">
                    ${btnText}
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

function nextRound() {
    const overlay = document.getElementById('roundWinOverlay');
    if (overlay) overlay.remove();
    teamSetup.currentRound++;

    // Show Round Transition
    const ts = document.getElementById('transitionScreen');
    const tsContent = document.getElementById('tsContent');
    if (ts && tsContent) {
        ts.style.display = 'flex';
        tsContent.innerHTML = `
            <div class="ts-round-info animate-zoom-in">
                <div style="font-size: 5rem; color: #FFD600; font-family: 'Lalezar', sans-serif;">الجولة ${ROUND_WORDS[(teamSetup.currentRound - 1) % ROUND_WORDS.length]}</div>
                <div style="font-size: 2rem; color: #fff; opacity: 0.8;">استعدوا!</div>
            </div>
        `;
        setTimeout(() => {
            ts.classList.add('fade-out');
            setTimeout(() => {
                ts.style.display = 'none';
                ts.classList.remove('fade-out');
            }, 500);
        }, 1500);
    }

    updateRoundDisplay();
    initBoard();
    renderBoard();
    cancelSelect();
}

function showFinalFromRound() {
    const overlay = document.getElementById('roundWinOverlay');
    if (overlay) overlay.remove();
    showFinalResult();
}

// ===== Board Full Check =====
function isBoardFull() {
    for (let r = 0; r < BOARD_SIZE; r++)
        for (let c = 0; c < BOARD_SIZE; c++)
            if (!board[r][c]) return false;
    return true;
}

// ===== Handle Round End =====
function handleRoundEnd() {
    if (teamSetup.currentRound >= teamSetup.totalRounds) {
        // Game over
        showFinalResult();
    } else {
        teamSetup.currentRound++;
        updateRoundDisplay();
        initBoard();
        renderBoard();
        cancelSelect();
    }
}

// ===== Final Result =====
function showFinalResult() {
    const s1 = scores.team1;
    const s2 = scores.team2;
    const n1 = teamSetup.team1.name;
    const n2 = teamSetup.team2.name;
    const c1 = COLOR_MAP[teamSetup.team1.color];
    const c2 = COLOR_MAP[teamSetup.team2.color];

    let msg = '';
    if (s1 > s2) msg = `🏆 مبروك ${n1}!`;
    else if (s2 > s1) msg = `🏆 مبروك ${n2}!`;
    else msg = '🤝 تعادل!';

    const html = `
        <div style="
            position:fixed;inset:0;background:rgba(0,0,0,0.87);
            display:flex;align-items:center;justify-content:center;
            z-index:9999;direction:rtl;
        ">
        <div style="
            background:#1e0a3c;border:3px solid #FFD600;border-radius:28px;
            padding:48px 40px;text-align:center;max-width:420px;width:90%;
            box-shadow:0 0 60px rgba(255,214,0,0.3);
        ">
            <div style="font-size:4rem;margin-bottom:12px;">🏅</div>
            <div style="font-family:Lalezar,sans-serif;font-size:2rem;color:#FFD600;
                        -webkit-text-stroke:2px #000;margin-bottom:20px;">${msg}</div>
            <div style="display:flex;gap:20px;justify-content:center;margin-bottom:28px;">
                <div style="background:${c1.bg};border-radius:14px;padding:14px 22px;min-width:100px;">
                    <div style="font-size:0.9rem;color:${c1.text};font-weight:700;">${n1}</div>
                    <div style="font-family:Lalezar,sans-serif;font-size:2.5rem;color:#FFD600;
                                -webkit-text-stroke:2px #000;">${s1}</div>
                </div>
                <div style="background:${c2.bg};border-radius:14px;padding:14px 22px;min-width:100px;">
                    <div style="font-size:0.9rem;color:${c2.text};font-weight:700;">${n2}</div>
                    <div style="font-family:Lalezar,sans-serif;font-size:2.5rem;color:#FFD600;
                                -webkit-text-stroke:2px #000;">${s2}</div>
                </div>
            </div>
            <button onclick="location.reload()" style="
                font-family:Lalezar,sans-serif;font-size:1.3rem;
                padding:14px 36px;border:none;border-radius:50px;
                background:#FFD600;color:#1a1a1a;cursor:pointer;
                box-shadow:0 6px 24px rgba(255,214,0,0.4);
            ">🔄 لعبة جديدة</button>
        </div></div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

// ===== Hex Size =====
function getHexSize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const sidebar = 300;
    const padH = 80;

    const availW = vw - sidebar;
    const availH = vh - padH;

    const wFactor = BOARD_SIZE - 0.5;
    const hFactor = ((BOARD_SIZE - 1) * 0.75 + 1) * 1.1547;

    const maxByW = availW / wFactor;
    const maxByH = availH / hFactor;

    return Math.max(60, Math.min(maxByW, maxByH, 180));
}

// ===== Shuffle =====
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ===== Resize =====
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderBoard, 200);
});

// ==========================================
// ===== BUZZER INTEGRATION MODULE ==========
// ==========================================
let buzzerSocket = null;
let buzzerRoom = null;
let isBuzzerLocked = false;

function openBuzzerModal() {
    toggleGameMenu(); // Close the dropdown menu First

    // Only generate once per session
    if (!buzzerRoom) {
        // Generate 4-character random code
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        buzzerRoom = code;

        document.getElementById('modalBuzzerCodeTxt').textContent = code;
        document.getElementById('modalBuzzerCodeTxt').parentElement.dataset.code = code;

        // رابط موقع الجرس الخارجي مع بيانات الجلسة والفريقين
        const buzzerBase = 'https://buzzer-server-production-331c.up.railway.app/';
        const t1 = encodeURIComponent(teamSetup.team1.name);
        const t2 = encodeURIComponent(teamSetup.team2.name);
        const fullUrl = `${buzzerBase}?room=${buzzerRoom}&team1=${t1}&team2=${t2}`;
        console.log("Full QR Link:", fullUrl);

        // Generate QR Code
        const qrBox = document.getElementById('modalQrcodeBox');
        if (qrBox) {
            qrBox.innerHTML = ''; // Clear previous if any

            if (typeof QRCode !== 'undefined') {
                try {
                    // Support for legacy QRCodeJS
                    new QRCode(qrBox, {
                        text: fullUrl,
                        width: 150,
                        height: 150,
                        colorDark: "#4A2570",
                        colorLight: "#ffffff"
                    });
                    console.log("QR Code generated successfully for:", fullUrl);

                    // Add click to enlarge feature
                    qrBox.title = "اضغط للتكبير";
                    qrBox.style.cursor = "zoom-in";
                    qrBox.onclick = () => {
                        const win = window.open("", "_blank");
                        win.document.write(`<html><body style="margin:0; background:#1a1a1a; display:flex; align-items:center; justify-content:center; height:100vh;"><div style="background:#fff; padding:20px; border-radius:20px;">${qrBox.innerHTML}</div></body></html>`);
                        win.document.body.querySelector('img, canvas').style.width = '400px';
                        win.document.body.querySelector('img, canvas').style.height = '400px';
                    };
                } catch (e) {
                    console.error("Error generating QR code:", e);
                    qrBox.innerHTML = '<div style="color:#1a1a1a; font-size:0.8rem;">خطأ في إنشاء الباركود</div>';
                }
            } else {
                console.warn('QRCode library not loaded');
                qrBox.innerHTML = '<div style="color:#1a1a1a; font-size:0.8rem;">مكتبة الباركود غير محملة</div>';
            }
        }

        // Connect to Socket.io (using Railway server)
        if (!buzzerSocket && typeof io !== 'undefined') {
            const socketUrl = 'https://buzzer-server-production-331c.up.railway.app/';
            buzzerSocket = io(socketUrl, {
                reconnection: true,
                reconnectionAttempts: Infinity,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                timeout: 5000
            });

            // مؤشر حالة الاتصال
            function setBuzzerStatus(status) {
                let indicator = document.getElementById('buzzerStatusDot');
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.id = 'buzzerStatusDot';
                    indicator.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:9999;display:flex;align-items:center;gap:8px;background:rgba(0,0,0,0.6);padding:8px 14px;border-radius:50px;font-size:0.8rem;color:#fff;font-family:Cairo,sans-serif;font-weight:700;backdrop-filter:blur(8px);transition:opacity 0.5s;';
                    document.body.appendChild(indicator);
                }
                const colors = { connected: '#4ADE80', disconnected: '#EF4444', reconnecting: '#FFD600' };
                const labels = { connected: 'الجرس متصل ✓', disconnected: 'الجرس منقطع ✕', reconnecting: 'جاري إعادة الاتصال...' };
                indicator.style.opacity = '1';
                indicator.innerHTML = '<div style="width:10px;height:10px;border-radius:50%;background:' + colors[status] + ';"></div>' + labels[status];
                if (status === 'connected') setTimeout(() => { indicator.style.opacity = '0'; }, 3000);
            }

            buzzerSocket.on('connect', () => {
                console.log('Connected to Buzzer Server as Host');
                buzzerSocket.emit('host-join', buzzerRoom);
                setBuzzerStatus('connected');
            });

            buzzerSocket.on('disconnect', () => {
                console.warn('Buzzer disconnected');
                setBuzzerStatus('disconnected');
            });

            buzzerSocket.on('reconnecting', () => {
                setBuzzerStatus('reconnecting');
            });

            buzzerSocket.on('reconnect', () => {
                console.log('Buzzer reconnected - rejoining room');
                buzzerSocket.emit('host-join', buzzerRoom);
                setBuzzerStatus('connected');
            });

            buzzerSocket.on('buzzed', (data) => {
                isBuzzerLocked = true;
                showBuzzerOverlay(data.name, data.team);

                // Start the 3-second timer for the team that buzzed
                startTimer(data.team, 3, false);

                // فتح الجرس تلقائياً بعد 13 ثانية
                setTimeout(() => {
                    if (buzzerSocket && buzzerRoom) {
                        buzzerSocket.emit('reset-buzzes');
                        isBuzzerLocked = false;
                        clearBuzzerLock();
                    }
                }, 13000);

                // Play sound to alert the host
                if (teamSetup.sound === 'on') {
                    const aud = document.getElementById('enterSound') || document.getElementById('correctSound');
                    if (aud) { aud.currentTime = 0; aud.play().catch(e => console.log(e)); }
                }
            });
        } else if (buzzerSocket) {
            // Re-join if already instantiated
            buzzerSocket.emit('host-join', buzzerRoom);
        }
    }

    // Show Modal
    document.getElementById('buzzerShareModal').style.display = 'flex';
}

function showBuzzerOverlay(name, teamId) {
    const teamObj = teamId === 'team1' ? teamSetup.team1 : teamSetup.team2;
    const color = COLOR_MAP[teamObj.color];

    const html = `
        <div id="buzzerLockOverlay" onclick="this.remove()" style="
            position: fixed; top: 30px; left: 50%; transform: translateX(-50%); z-index: 99999;
            background: ${color.bg}; padding: 16px 48px; border-radius: 50px;
            text-align: center; border: 3px solid #fff;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            display: flex; align-items: center; gap: 20px;
            animation: popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            cursor: pointer;
        ">
            <div style="font-size: 3rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">🔔</div>
            <div style="display:flex; flex-direction:column; align-items:flex-start;">
                <div style="font-size: 1.1rem; color: rgba(255,255,255,0.9); font-weight:800; margin-bottom:-5px;">أسرع ضغطة</div>
                <div style="font-family:'HrofFont', sans-serif; font-size: 2.8rem; color: #fff; line-height:1; -webkit-text-stroke: 1px rgba(0,0,0,0.2); text-shadow: 0 2px 5px rgba(0,0,0,0.3);">${name}</div>
                <div style="font-family:'HrofFont', sans-serif; font-size: 1rem; color: #fff; opacity:0.9; font-weight:bold; margin-top:2px;">${teamObj.name}</div>
            </div>
            <div style="position:absolute; top:8px; right:15px; font-size:1.2rem; opacity:0.6;">✕</div>
        </div>
    `;
    const old = document.getElementById('buzzerLockOverlay');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
}

function clearBuzzerLock() {
    isBuzzerLocked = false;
    const overlay = document.getElementById('buzzerLockOverlay');
    if (overlay) overlay.remove();
}

// ===== BUZZER PARTICIPANT LOGIC =====
let participantData = {
    room: null,
    name: '',
    team: ''
};

function initBuzzerParticipant() {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (!roomCode) return;

    participantData.room = roomCode;

    // Hide everything else
    document.getElementById('homeScreen').style.display = 'none';
    document.querySelector('.sidebar').style.display = 'none';
    document.querySelector('.main-area').style.display = 'none';

    // Show participant view
    document.getElementById('buzzerParticipantView').style.display = 'flex';
}

function participantSelectTeam(team) {
    participantData.team = team;
    document.getElementById('participantPickTeam1').classList.toggle('selected', team === 'team1');
    document.getElementById('participantPickTeam2').classList.toggle('selected', team === 'team2');

    // UI Feedback colors
    const c1 = COLOR_MAP.orange.bg;
    const c2 = COLOR_MAP.purple.bg;
    document.getElementById('participantPickTeam1').style.borderColor = team === 'team1' ? '#FFD600' : 'transparent';
    document.getElementById('participantPickTeam1').style.background = team === 'team1' ? c1 : 'rgba(255,255,255,0.1)';
    document.getElementById('participantPickTeam2').style.borderColor = team === 'team2' ? '#FFD600' : 'transparent';
    document.getElementById('participantPickTeam2').style.background = team === 'team2' ? c2 : 'rgba(255,255,255,0.1)';
}

function participantJoin() {
    const nameInput = document.getElementById('buzzerPlayerName');
    const name = nameInput.value.trim();

    if (!name) {
        alert('يرجى إدخال اسمك');
        return;
    }
    if (!participantData.team) {
        alert('يرجى اختيار فريقك');
        return;
    }

    participantData.name = name;

    const socketUrl = 'https://buzzer-server-production-331c.up.railway.app/';
    if (typeof io === 'undefined') {
        alert('خطأ في الاتصال بالخادم. يرجى المحاولة لاحقاً.');
        return;
    }

    buzzerSocket = io(socketUrl);

    buzzerSocket.on('connect', () => {
        buzzerSocket.emit('player-join', {
            room: participantData.room,
            name: participantData.name,
            team: participantData.team
        });

        document.getElementById('buzzerSetupPhase').style.display = 'none';
        document.getElementById('buzzerActionPhase').style.display = 'block';
        document.getElementById('participantStatus').textContent = 'تم الانضمام لغرفة: ' + participantData.room;
    });

    buzzerSocket.on('buzzed', (data) => {
        // Disable button visually when someone buzzes
        const btn = document.getElementById('mainBuzzBtn');
        btn.style.opacity = '0.5';
        btn.style.pointerEvents = 'none';
        document.getElementById('participantStatus').textContent = 'تحرك الجرس من: ' + data.name;

        setTimeout(() => {
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
            document.getElementById('participantStatus').textContent = 'الجرس متاح!';
        }, 4000);
    });
}

function participantBuzz() {
    if (!buzzerSocket) return;

    const btn = document.getElementById('mainBuzzBtn');
    btn.style.transform = 'scale(0.9) translateY(10px)';
    btn.style.boxShadow = '0 5px 15px rgba(0,0,0,0.7)';

    setTimeout(() => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = '0 15px 40px rgba(0,0,0,0.5)';
    }, 100);

    buzzerSocket.emit('buzz', {
        room: participantData.room,
        name: participantData.name,
        team: participantData.team
    });
}