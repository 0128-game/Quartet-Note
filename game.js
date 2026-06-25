if (typeof window.GameCore === 'undefined') {
    window.GameCore = {
        currentMode: 'play', 
        score: 0,
        combo: 0,
        maxCombo: 0,
        noteSpeedMs: 1000, 
        
        judgments: {
            perfect: 40,
            great: 80,
            good: 130,
            miss: 200
        },

        keyMap: { 'd': 0, 'f': 1, 'j': 2, 'k': 3 },
        
        // 入力管理
        pressTimestamps: { 0: null, 1: null, 2: null, 3: null }, 
        isKeyHolding: { 0: false, 1: false, 2: false, 3: false }, 

        // プレイヤー位置フラグ (true=背景、false=前面)
        isBgVisible: true, 

        // 現在各レーンで生成した「仮の始点と終点」を記憶するバッファ
        recordingNotes: { 0: null, 1: null, 2: null, 3: null },

        init() {
            this.setupEventListeners();
            this.startGameLoop();
        },

        setupEventListeners() {
            const btnPlay = document.getElementById('btn-mode-play');
            const btnRecord = document.getElementById('btn-mode-record');
            const btnEdit = document.getElementById('btn-mode-edit');
            const btnToggleBg = document.getElementById('btn-toggle-bg');

            if (btnPlay) btnPlay.addEventListener('click', () => this.switchMode('play'));
            if (btnRecord) btnRecord.addEventListener('click', () => this.switchMode('record'));
            if (btnEdit) btnEdit.addEventListener('click', () => this.switchMode('edit'));
            
            if (btnToggleBg) {
                btnToggleBg.addEventListener('click', () => this.toggleBackground());
            }

            // キーボード：押したとき
            window.addEventListener('keydown', (e) => {
                const key = e.key.toLowerCase();
                
                if (e.key === ' ') {
                    e.preventDefault();
                    this.togglePlayback();
                    return;
                }

                if (this.isBgVisible && this.keyMap.hasOwnProperty(key)) {
                    const lane = this.keyMap[key];
                    if (!this.isKeyHolding[lane]) {
                        this.isKeyHolding[lane] = true;
                        this.handlePressStart(lane);
                    }
                }
            });

            // キーボード：離したとき
            window.addEventListener('keyup', (e) => {
                const key = e.key.toLowerCase();
                if (this.isBgVisible && this.keyMap.hasOwnProperty(key)) {
                    const lane = this.keyMap[key];
                    this.isKeyHolding[lane] = false;
                    this.handlePressEnd(lane);
                }
            });

            // 画面タッチ・マウス操作
            for (let i = 0; i < 4; i++) {
                const laneEl = document.getElementById(`lane-${i}`);
                if (!laneEl) continue;
                
                const startEvent = 'ontouchstart' in window ? 'touchstart' : 'mousedown';
                const endEvent = 'ontouchstart' in window ? 'touchend' : 'mouseup';

                laneEl.addEventListener(startEvent, (e) => {
                    if (!this.isBgVisible) return;
                    e.preventDefault();
                    if (!this.isKeyHolding[i]) {
                        this.isKeyHolding[i] = true;
                        this.handlePressStart(i);
                    }
                });
                laneEl.addEventListener(endEvent, (e) => {
                    if (!this.isBgVisible) return;
                    e.preventDefault();
                    this.isKeyHolding[i] = false;
                    this.handlePressEnd(i);
                });
                laneEl.addEventListener('mouseleave', (e) => {
                    if (this.isKeyHolding[i]) {
                        this.isKeyHolding[i] = false;
                        this.handlePressEnd(i);
                    }
                });
            }
        },

        toggleBackground() {
            const videoContainer = document.getElementById('video-container');
            const btnToggleBg = document.getElementById('btn-toggle-bg');
            if (!videoContainer || !btnToggleBg) return;

            this.isBgVisible = !this.isBgVisible;

            if (this.isBgVisible) {
                videoContainer.style.zIndex = '1';          
                videoContainer.style.pointerEvents = 'none'; 
                videoContainer.style.opacity = '0.25';       
                btnToggleBg.textContent = 'プレイヤー: 背景';
                btnToggleBg.style.backgroundColor = ''; 
            } else {
                videoContainer.style.zIndex = '20';          
                videoContainer.style.pointerEvents = 'auto'; 
                videoContainer.style.opacity = '1';          
                btnToggleBg.textContent = 'プレイヤー: 前面';
                btnToggleBg.style.backgroundColor = '#ff007f'; 
            }
        },

        togglePlayback() {
            if (!window.GameAudio || !window.GameAudio.player) return;
            try {
                const state = window.GameAudio.player.getPlayerState();
                if (state === 1) { 
                    window.GameAudio.pause();
                } else { 
                    window.GameAudio.play();
                }
            } catch (e) {
                window.GameAudio.play();
            }
        },

        // 【押した瞬間】の処理
        handlePressStart(lane) {
            const currentTime = window.GameAudio ? window.GameAudio.getCurrentTimeMs() : Date.now();
            this.pressTimestamps[lane] = currentTime;

            const laneEl = document.getElementById(`lane-${lane}`);
            // ★エフェクト追加：押している間ずっとクラスを維持します
            if (laneEl) {
                const effectZone = laneEl.querySelector('.lane-effect-zone');
                if (effectZone) {
                    effectZone.classList.add('active-tap');
                } else {
                    laneEl.classList.add('active-tap');
                }
            }

            // 【録音モード】
            if (this.currentMode === 'record') {
                if (window.GameAudio && window.GameAudio.isRecording) {
                    const startNote = {
                        time: currentTime,
                        lane: lane,
                        type: 'tap',
                        judged: false
                    };
                    const endNote = {
                        time: currentTime, 
                        lane: lane,
                        type: 'slide',
                        judged: false
                    };

                    window.GameAudio.notesData.push(startNote);
                    window.GameAudio.notesData.push(endNote);

                    this.recordingNotes[lane] = { start: startNote, end: endNote };
                    this.sortAndRefreshTimeline();
                }
            } 
            else if (this.currentMode === 'play') {
                this.judgeOnPress(lane, currentTime);
            }
        },

        // 【離した瞬間】の処理
        handlePressEnd(lane) {
            const laneEl = document.getElementById(`lane-${lane}`);
            // ★エフェクト解除：離した瞬間に綺麗に消去します
            if (laneEl) {
                laneEl.classList.remove('active-tap', 'active-slide');
                const effectZone = laneEl.querySelector('.lane-effect-zone');
                if (effectZone) {
                    effectZone.classList.remove('active-tap', 'active-slide');
                }
            }

            if (this.pressTimestamps[lane] === null) return;

            const currentTime = window.GameAudio ? window.GameAudio.getCurrentTimeMs() : Date.now();

            if (this.currentMode === 'record') {
                const session = this.recordingNotes[lane];

                if (session) {
                    const duration = currentTime - session.start.time;

                    if (duration < 500) {
                        window.GameAudio.notesData = window.GameAudio.notesData.filter(note => note !== session.end);
                        console.log("単発タップとして記録しました");
                    } else {
                        session.end.time = currentTime;
                        console.log("スライド（ロングノーツ）として確定しました");
                    }

                    this.sortAndRefreshTimeline();
                    this.recordingNotes[lane] = null; 
                }
            } else if (this.currentMode === 'play') {
                this.judgeOnRelease(lane, currentTime);
            }

            this.pressTimestamps[lane] = null;
        },

        sortAndRefreshTimeline() {
            if (window.GameAudio && window.GameAudio.notesData) {
                window.GameAudio.notesData.sort((a, b) => a.time - b.time);
            }
            if (window.GameVisuals && typeof window.GameVisuals.updateTimeline === 'function') {
                window.GameVisuals.updateTimeline();
            }
        },

        recordEvaluatedNote(lane, targetTime, type) {
        },

        switchMode(mode) {
            this.currentMode = mode;
            
            document.getElementById('btn-mode-play').classList.remove('active');
            document.getElementById('btn-mode-record').classList.remove('active');
            document.getElementById('btn-mode-edit').classList.remove('active');
            document.getElementById('editor-panel').classList.add('hidden');
            document.getElementById('combo-display').classList.add('hidden');
            
            if (window.GameAudio) window.GameAudio.isRecording = false;

            if (mode === 'play') {
                document.getElementById('btn-mode-play').classList.add('active');
                document.getElementById('combo-display').classList.remove('hidden');
                this.resetLive();
            } else if (mode === 'record') {
                document.getElementById('btn-mode-record').classList.add('active');
                if (window.GameAudio) window.GameAudio.isRecording = true;
                alert('録音モード: スペースキーで再生。長押しでスライドノーツが作成されます。');
            } else if (mode === 'edit') {
                document.getElementById('btn-mode-edit').classList.add('active');
                document.getElementById('editor-panel').classList.remove('hidden');
                if (window.GameVisuals) window.GameVisuals.updateTimeline();
            }
        },

        resetLive() {
            this.combo = 0;
            document.getElementById('combo-display').textContent = '0 COMBO';
            document.getElementById('judgment-display').textContent = '';
            if (window.GameAudio && window.GameAudio.notesData) {
                window.GameAudio.notesData.forEach(n => {
                    n.judged = false;
                    n.holdStarted = false; 
                });
            }
        },

        judgeOnPress(lane, currentTime) {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            
            const targetNote = window.GameAudio.notesData.find(note => 
                note.lane === lane && !note.judged && note.type === 'tap' && Math.abs(note.time - currentTime) <= this.judgments.miss
            );

            if (!targetNote) return;

            const rating = this.calculateRating(targetNote.time, currentTime);
            targetNote.judged = true;

            if (rating !== 'MISS') {
                const hasEndNote = window.GameAudio.notesData.some(n => n.lane === lane && n.type === 'slide' && n.time > targetNote.time && !n.judged);
                if (hasEndNote) {
                    targetNote.holdStarted = true;
                }
                this.combo++;
            } else {
                this.combo = 0;
            }

            this.displayJudgment(rating, this.getRatingClass(rating));
        },

        judgeOnRelease(lane, currentTime) {
            const pairs = this.getLongNotePairs();
            
            const activePair = pairs.find(pair => 
                pair.start.lane === lane && pair.start.holdStarted && !pair.end.judged
            );

            if (!activePair) return;

            const rating = this.calculateRating(activePair.end.time, currentTime);
            activePair.end.judged = true;
            activePair.start.holdStarted = false; 

            if (rating !== 'MISS') {
                this.combo++;
            } else {
                this.combo = 0;
            }

            this.displayJudgment(rating, this.getRatingClass(rating));
        },

        calculateRating(targetTime, currentTime) {
            const diff = Math.abs(targetTime - currentTime);
            if (diff <= this.judgments.perfect) return 'PERFECT';
            if (diff <= this.judgments.great) return 'GREAT';
            if (diff <= this.judgments.good) return 'GOOD';
            return 'MISS';
        },

        getRatingClass(rating) {
            if (rating === 'PERFECT') return 'jd-perfect';
            if (rating === 'GREAT') return 'jd-great';
            if (rating === 'GOOD') return 'jd-good';
            return 'jd-miss';
        },

        displayJudgment(text, className) {
            const display = document.getElementById('judgment-display');
            const comboDisplay = document.getElementById('combo-display');
            
            if (display) {
                display.textContent = text;
                display.className = className;
                display.style.transform = 'scale(1.2)';
                setTimeout(() => display.style.transform = 'scale(1.0)', 50);
            }

            if (comboDisplay) {
                comboDisplay.textContent = `${this.combo} COMBO`;
            }
        },

        getLongNotePairs() {
            if (!window.GameAudio || !window.GameAudio.notesData) return [];
            const pairs = [];
            const notes = window.GameAudio.notesData;

            for (let i = 0; i < notes.length; i++) {
                if (notes[i].type === 'tap') {
                    const endNote = notes.find((n, idx) => idx > i && n.lane === notes[i].lane && n.type === 'slide');
                    if (endNote) {
                        const timeDiff = endNote.time - notes[i].time;
                        if (timeDiff === 0 || timeDiff >= 450) {
                            pairs.push({ start: notes[i], end: endNote });
                        }
                    }
                }
            }
            return pairs;
        },

        startGameLoop() {
            const loop = () => {
                if (this.currentMode === 'play') {
                    this.checkLiveHoldNotes(); 
                    this.renderNotes();
                    this.checkMissedNotes();
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        },

        checkLiveHoldNotes() {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            const currentTime = window.GameAudio.getCurrentTimeMs();
            const pairs = this.getLongNotePairs();

            pairs.forEach(pair => {
                if (currentTime > pair.start.time && currentTime < pair.end.time - this.judgments.miss) {
                    if (pair.start.holdStarted && !pair.end.judged) {
                        if (!this.isKeyHolding[pair.start.lane]) {
                            pair.start.holdStarted = false;
                            pair.end.judged = true;
                            this.combo = 0;
                            this.displayJudgment('MISS', 'jd-miss');
                        }
                    }
                }

                if (currentTime > pair.end.time + this.judgments.miss && !pair.end.judged) {
                    pair.end.judged = true;
                    pair.start.holdStarted = false;
                    this.combo = 0;
                    this.displayJudgment('MISS', 'jd-miss');
                }
            });
        },

        renderNotes() {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            const currentTime = window.GameAudio.getCurrentTimeMs();
            const lanesContainer = document.getElementById('game-lanes');
            if (!lanesContainer) return;
            
            const existingNotes = lanesContainer.querySelectorAll('.note, .long-note-body');
            existingNotes.forEach(n => n.remove());

            const laneHeight = lanesContainer.clientHeight;
            const targetY = laneHeight * 0.85; 

            const pairs = this.getLongNotePairs();
            pairs.forEach(pair => {
                if (pair.end.judged) return; 

                const startTimeDiff = pair.start.time - currentTime;
                const endTimeDiff = pair.end.time - currentTime;

                if (startTimeDiff <= this.noteSpeedMs && endTimeDiff >= -200) {
                    const startProgress = 1 - (startTimeDiff / this.noteSpeedMs);
                    const endProgress = 1 - (endTimeDiff / this.noteSpeedMs);

                    let yStart = targetY * Math.pow(Math.max(0, startProgress), 1.5);
                    let yEnd = targetY * Math.pow(Math.max(0, endProgress), 1.5);

                    if (currentTime > pair.start.time && pair.start.holdStarted) {
                        yStart = targetY; 
                    }

                    const bodyHeight = yStart - yEnd;

                    if (bodyHeight > 0) {
                        const bodyEl = document.createElement('div');
                        bodyEl.className = 'long-note-body';
                        bodyEl.style.top = `${yEnd}px`;
                        bodyEl.style.height = `${bodyHeight}px`;
                        if (pair.start.holdStarted) {
                            bodyEl.style.background = 'linear-gradient(to bottom, #ffee00, #ffaa00)';
                            bodyEl.style.boxShadow = '0 0 15px #ffee00';
                        } else {
                            bodyEl.style.background = 'linear-gradient(to bottom, rgba(0,255,200,0.6), rgba(0,200,255,0.6))';
                        }

                        const laneEl = document.getElementById(`lane-${pair.start.lane}`);
                        if (laneEl) laneEl.appendChild(bodyEl);
                    }
                }
            });

            window.GameAudio.notesData.forEach(note => {
                if (note.judged) return;

                const timeDiff = note.time - currentTime;

                if (timeDiff <= this.noteSpeedMs && timeDiff >= -200) {
                    const progress = 1 - (timeDiff / this.noteSpeedMs);
                    const yPosition = targetY * Math.pow(progress, 1.5); 

                    const noteEl = document.createElement('div');
                    noteEl.className = `note note-${note.type}`;
                    noteEl.style.top = `${yPosition}px`;

                    const laneEl = document.getElementById(`lane-${note.lane}`);
                    if (laneEl) laneEl.appendChild(noteEl);
                }
            });
        },

        checkMissedNotes() {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            const currentTime = window.GameAudio.getCurrentTimeMs();
            
            window.GameAudio.notesData.forEach(note => {
                if (!note.judged && note.type === 'tap' && (currentTime - note.time) > this.judgments.miss) {
                    note.judged = true;
                    this.combo = 0;
                    this.displayJudgment('MISS', 'jd-miss');
                }
            });
        }
    };

    window.GameCore.init();
}

if (typeof window.GameVisuals === 'undefined') {
    window.GameVisuals = {
        updateTimeline() {
            const container = document.getElementById('timeline-container');
            if (!container) return;
            container.innerHTML = ''; 

            if (!window.GameAudio || !window.GameAudio.notesData || window.GameAudio.notesData.length === 0) {
                container.innerHTML = '<div style="color:#666; padding:20px;">ノーツデータがありません。先に録音してください。</div>';
                return;
            }

            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.gap = '15px';
            wrapper.style.padding = '10px';
            wrapper.style.width = 'max-content';

            window.GameAudio.notesData.forEach((note, index) => {
                const item = document.createElement('div');
                item.style.background = '#2a2e45';
                item.style.border = `2px solid ${note.type === 'slide' ? '#ffee00' : '#00ffff'}`;
                item.style.padding = '8px';
                item.style.borderRadius = '4px';
                item.style.minWidth = '90px';
                item.style.textAlign = 'center';

                item.innerHTML = `
                    <div style="font-size:11px; color:#aaa;">LANE: ${note.lane} (${note.type.toUpperCase()})</div>
                    <input type="number" value="${note.time}" step="10" style="width:75px; background:#111; color:#fff; border:1px solid #555; text-align:center; font-size:12px; margin:4px 0;" data-index="${index}">
                    <button style="padding:2px 6px; font-size:10px; background:#cc0000; border:none; color:#fff; cursor:pointer;" onclick="window.GameVisuals.deleteNote(${index})">削除</button>
                `;

                const input = item.querySelector('input');
                input.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.getAttribute('data-index'));
                    const newTime = parseInt(e.target.value);
                    window.GameAudio.notesData[idx].time = newTime;
                    window.GameAudio.notesData.sort((a, b) => a.time - b.time);
                    setTimeout(() => window.GameVisuals.updateTimeline(), 500);
                });

                wrapper.appendChild(item);
            });

            container.appendChild(wrapper);
        },

        deleteNote(index) {
            if (window.GameAudio && window.GameAudio.notesData) {
                window.GameAudio.notesData.splice(index, 1);
                this.updateTimeline();
            }
        }
    };
}
