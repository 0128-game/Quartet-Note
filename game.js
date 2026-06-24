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
        
        // 長押し判定用のタイムスタンプ管理（レーンごと）
        pressTimestamps: { 0: null, 1: null, 2: null, 3: null },

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

            // キーボード：押したとき
            window.addEventListener('keydown', (e) => {
                const key = e.key.toLowerCase();
                if (this.keyMap.hasOwnProperty(key)) {
                    const lane = this.keyMap[key];
                    // 長押しの連続入力を防ぐガード
                    if (this.pressTimestamps[lane] === null) {
                        this.handlePressStart(lane);
                    }
                }
                // スペースキーで再生・一時停止（最優先）
                if (e.key === ' ') {
                    e.preventDefault();
                    this.togglePlayback();
                }
            });

            // キーボード：離したとき
            window.addEventListener('keyup', (e) => {
                const key = e.key.toLowerCase();
                if (this.keyMap.hasOwnProperty(key)) {
                    const lane = this.keyMap[key];
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
                    e.preventDefault();
                    this.handlePressStart(i);
                });
                laneEl.addEventListener(endEvent, (e) => {
                    e.preventDefault();
                    this.handlePressEnd(i);
                });
                // マウスがレーン外に出て離されたときの対策
                laneEl.addEventListener('mouseleave', (e) => {
                    if (this.pressTimestamps[i] !== null) {
                        this.handlePressEnd(i);
                    }
                });
            }
        },

        // 再生・一時停止の切り替え
        togglePlayback() {
            if (!window.GameAudio || !window.GameAudio.player) return;
            try {
                const state = window.GameAudio.player.getPlayerState();
                if (state === 1) { // 再生中なら一時停止
                    window.GameAudio.pause();
                } else { // 停止中なら再生
                    window.GameAudio.play();
                }
            } catch (e) {
                window.GameAudio.play();
            }
        },

        // ボタン/キーを「押した」瞬間
        handlePressStart(lane) {
            // 押した時の楽曲位置（ミリ秒）を記録
            if (window.GameAudio) {
                this.pressTimestamps[lane] = window.GameAudio.getCurrentTimeMs();
            } else {
                this.pressTimestamps[lane] = Date.now();
            }

            // レーン発光（デフォルトはタップ色）
            const laneEl = document.getElementById(`lane-${lane}`);
            if (laneEl) laneEl.classList.add('active-tap');

            // プレイモードなら、押した瞬間に即座に判定
            if (this.currentMode === 'play') {
                this.judgeNote(lane);
            }
        },

        // ボタン/キーを「離した」瞬間
        handlePressEnd(lane) {
            const laneEl = document.getElementById(`lane-${lane}`);
            if (laneEl) laneEl.classList.remove('active-tap', 'active-slide');

            if (this.pressTimestamps[lane] === null) return;

            // 録音モードの時、離したタイミングで長さを計測
            if (this.currentMode === 'record' && window.GameAudio) {
                const startTime = this.pressTimestamps[lane];
                const endTime = window.GameAudio.getCurrentTimeMs();
                const duration = endTime - startTime;

                if (duration >= 500) {
                    // 【長押し（0.5秒以上）の場合】
                    // 始点を「tap」ノーツ、終点を「slide」ノーツとして両方記録する
                    this.recordEvaluatedNote(lane, startTime, 'tap');
                    this.recordEvaluatedNote(lane, endTime, 'slide');
                } else {
                    // 【通常タップ（0.5秒未満）の場合】
                    // 始点のタイミングだけを「tap」として記録
                    this.recordEvaluatedNote(lane, startTime, 'tap');
                }
            }

            // タイムスタンプをリセット
            this.pressTimestamps[lane] = null;
        },

        // 判別したノーツをAudioオブジェクトのデータ配列に追加
        recordEvaluatedNote(lane, targetTime, type) {
            if (!window.GameAudio || !window.GameAudio.isRecording) return;

            // 同一レーン・ほぼ同時刻（50ms未満）の重複登録をガード
            const isDuplicate = window.GameAudio.notesData.some(note => 
                note.lane === lane && Math.abs(note.time - targetTime) < 50
            );

            if (!isDuplicate) {
                window.GameAudio.notesData.push({
                    time: targetTime,
                    lane: lane,
                    type: type
                });
                // 時間順に綺麗にソート
                window.GameAudio.notesData.sort((a, b) => a.time - b.time);
                
                if (window.GameVisuals && typeof window.GameVisuals.updateTimeline === 'function') {
                    window.GameVisuals.updateTimeline();
                }
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
                alert('録音モード: スペースキーを押すと音楽が始まります。音楽に合わせてキー（DFJK）やレーンを長押しすると、始点(TAP)と終点(SLIDE)が自動記録されます。');
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
