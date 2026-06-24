// 重複宣言エラー（SyntaxError）を防ぐため、windowオブジェクトのプロパティとして定義
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
        currentRecordType: 'tap', 

        init() {
            this.setupEventListeners();
            this.startGameLoop();
        },

        setupEventListeners() {
            const btnPlay = document.getElementById('btn-mode-play');
            const btnRecord = document.getElementById('btn-mode-record');
            const btnEdit = document.getElementById('btn-mode-edit');

            if (btnPlay) btnPlay.addEventListener('click', () => this.switchMode('play'));
            if (btnRecord) btnRecord.addEventListener('click', () => this.switchMode('record'));
            if (btnEdit) btnEdit.addEventListener('click', () => this.switchMode('edit'));

            window.addEventListener('keydown', (e) => {
                const key = e.key.toLowerCase();
                if (this.keyMap.hasOwnProperty(key)) {
                    const lane = this.keyMap[key];
                    this.handleInput(lane);
                }
                if (e.key === 'Shift' && this.currentMode === 'record') {
                    this.currentRecordType = this.currentRecordType === 'tap' ? 'slide' : 'tap';
                    console.log(`記録ノーツタイプ変更: ${this.currentRecordType}`);
                }
                if (e.key === ' ') {
                    e.preventDefault();
                    if (window.GameAudio && window.GameAudio.player && window.GameAudio.player.getPlayerState() === 1) {
                        window.GameAudio.pause();
                    } else if (window.GameAudio) {
                        window.GameAudio.play();
                    }
                }
            });

            window.addEventListener('keyup', (e) => {
                const key = e.key.toLowerCase();
                if (this.keyMap.hasOwnProperty(key)) {
                    const lane = this.keyMap[key];
                    const laneEl = document.getElementById(`lane-${lane}`);
                    if (laneEl) laneEl.classList.remove('active-tap', 'active-slide');
                }
            });

            for (let i = 0; i < 4; i++) {
                const laneEl = document.getElementById(`lane-${i}`);
                if (!laneEl) continue;
                
                const startEvent = 'ontouchstart' in window ? 'touchstart' : 'mousedown';
                const endEvent = 'ontouchstart' in window ? 'touchend' : 'mouseup';

                laneEl.addEventListener(startEvent, (e) => {
                    e.preventDefault();
                    this.handleInput(i);
                });
                laneEl.addEventListener(endEvent, (e) => {
                    e.preventDefault();
                    laneEl.classList.remove('active-tap', 'active-slide');
                });
            }
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
                alert('録音モード: スペースキーまたは画面タップで音楽が始まります。DFJKでノーツを記録、Shiftでタップ/スライド切り替え。');
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
                window.GameAudio.notesData.forEach(n => n.judged = false);
            }
        },

        handleInput(lane) {
            const laneEl = document.getElementById(`lane-${lane}`);
            if (!laneEl) return;
            
            const activeClass = this.currentMode === 'record' && this.currentRecordType === 'slide' ? 'active-slide' : 'active-tap';
            laneEl.classList.add(activeClass);

            if (this.currentMode === 'record') {
                if (window.GameAudio) window.GameAudio.recordNote(lane, this.currentRecordType);
            } else if (this.currentMode === 'play') {
                this.judgeNote(lane);
            }
        },

        judgeNote(lane) {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            const currentTime = window.GameAudio.getCurrentTimeMs();
            
            const targetNote = window.GameAudio.notesData.find(note => 
                note.lane === lane && !note.judged && Math.abs(note.time - currentTime) <= this.judgments.miss
            );

            if (!targetNote) return;

            const diff = Math.abs(targetNote.time - currentTime);
            let rating = 'MISS';
            let ratingClass = 'jd-miss';

            if (diff <= this.judgments.perfect) {
                rating = 'PERFECT';
                ratingClass = 'jd-perfect';
                this.combo++;
            } else if (diff <= this.judgments.great) {
                rating = 'GREAT';
                ratingClass = 'jd-great';
                this.combo++;
            } else if (diff <= this.judgments.good) {
                rating = 'GOOD';
                ratingClass = 'jd-good';
                this.combo++;
            } else {
                rating = 'MISS';
                ratingClass = 'jd-miss';
                this.combo = 0;
            }

            targetNote.judged = true;
            this.displayJudgment(rating, ratingClass);
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

        startGameLoop() {
            const loop = () => {
                if (this.currentMode === 'play') {
                    this.renderNotes();
                    this.checkMissedNotes();
                }
                requestAnimationFrame(loop);
            };
            requestAnimationFrame(loop);
        },

        renderNotes() {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            const currentTime = window.GameAudio.getCurrentTimeMs();
            const lanesContainer = document.getElementById('game-lanes');
            if (!lanesContainer) return;
            
            const existingNotes = lanesContainer.querySelectorAll('.note');
            existingNotes.forEach(n => n.remove());

            window.GameAudio.notesData.forEach(note => {
                if (note.judged) return;

                const timeDiff = note.time - currentTime;

                if (timeDiff <= this.noteSpeedMs && timeDiff >= -200) {
                    const progress = 1 - (timeDiff / this.noteSpeedMs);
                    const laneHeight = lanesContainer.clientHeight;
                    const targetY = laneHeight * 0.85; 
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
                if (!note.judged && (currentTime - note.time) > this.judgments.miss) {
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
