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

            // ★ 新規追加: 譜面情報編集ボタンのイベント
            const btnEditMeta = document.getElementById('btn-edit-meta');
            if (btnEditMeta) {
                btnEditMeta.addEventListener('click', () => {
                    this.openMetaDialog(false); // 編集モード(書き込み可能)で開く
                });
            }

            // ★ 新規追加: ダイアログを閉じるボタンのイベント
            const btnDialogClose = document.getElementById('btn-dialog-close');
            const metaDialog = document.getElementById('meta-dialog');
            if (btnDialogClose && metaDialog) {
                btnDialogClose.addEventListener('click', () => {
                    if (window.GameAudio) {
                        window.GameAudio.metaData = {
                            title: document.getElementById('meta-title').value || "無題の楽曲",
                            author: document.getElementById('meta-author').value || "名無し",
                            difficultyType: document.getElementById('meta-difficulty-type').value,
                            difficultyLevel: document.getElementById('meta-difficulty-level').value,
                            comment: document.getElementById('meta-comment').value
                        };
                    }
                    metaDialog.classList.add('hidden-dialog');
                    this.isDialogActive = false; // ★ ダイアログを閉じたので入力を許可
                });
            }

            // ★ 新規追加: エクスポートボタンの処理書き換え
            const btnExport = document.getElementById('btn-export');
            if (btnExport) {
                btnExport.addEventListener('click', () => this.exportChartWithMeta());
            }

            // ★ 新規追加: インポート（ファイル選択時）の処理書き換え
            const fileImport = document.getElementById('file-import');
            if (fileImport) {
                fileImport.addEventListener('change', (e) => this.importChartWithMeta(e));
            }

            // キーボード：押したとき
            window.addEventListener('keydown', (e) => {
                // ★ ダイアログが表示されている間はゲームへのキー入力を完全に無視（暴発防止）
                if (this.isDialogActive) return;

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
                // ★ ダイアログ表示中はキー離しも無視
                if (this.isDialogActive) return;

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
                    if (this.isDialogActive || !this.isBgVisible) return;
                    e.preventDefault();
                    if (!this.isKeyHolding[i]) {
                        this.isKeyHolding[i] = true;
                        this.handlePressStart(i);
                    }
                });
                laneEl.addEventListener(endEvent, (e) => {
                    if (this.isDialogActive || !this.isBgVisible) return;
                    e.preventDefault();
                    this.isKeyHolding[i] = false;
                    this.handlePressEnd(i);
                });
                laneEl.addEventListener('mouseleave', (e) => {
                    if (this.isDialogActive || !this.isKeyHolding[i]) return;
                    this.isKeyHolding[i] = false;
                    this.handlePressEnd(i);
                });
            }
        },

        // ★ 新規追加: ダイアログを開いてデータを同期する関数
        openMetaDialog(isReadOnly = false) {
            this.isDialogActive = true; // フラグを立ててスペースキー入力を一時ロック
            const metaDialog = document.getElementById('meta-dialog');
            if (!metaDialog) return;

            const meta = window.GameAudio?.metaData || { title: "", author: "", difficultyType: "MASTER", difficultyLevel: "30", comment: "" };

            // 画面の入力欄に現在のデータをセット
            document.getElementById('meta-title').value = meta.title;
            document.getElementById('meta-author').value = meta.author;
            document.getElementById('meta-difficulty-type').value = meta.difficultyType;
            document.getElementById('meta-difficulty-level').value = meta.difficultyLevel;
            document.getElementById('meta-comment').value = meta.comment;

            // 読み取り専用の切り替え設定
            const inputs = [
                document.getElementById('meta-title'),
                document.getElementById('meta-author'),
                document.getElementById('meta-difficulty-type'),
                document.getElementById('meta-difficulty-level'),
                document.getElementById('meta-comment')
            ];
            inputs.forEach(input => input.disabled = isReadOnly);

            metaDialog.classList.remove('hidden-dialog');
        },

exportChartWithMeta() {
            if (!window.GameAudio) window.GameAudio = {};
            if (!window.GameAudio.notesData) window.GameAudio.notesData = [];

            const titleEl = document.getElementById('meta-title');
            const authorEl = document.getElementById('meta-author');
            const typeEl = document.getElementById('meta-difficulty-type');
            const levelEl = document.getElementById('meta-difficulty-level');
            const commentEl = document.getElementById('meta-comment');

            // ★ window.GameAudio.currentVideoId から現在の動画IDを取得（無ければ初期値）
            const currentVideoId = window.GameAudio.currentVideoId || 'eWBjxT54RQA';

            const meta = {
                title: titleEl && titleEl.value ? titleEl.value : "無題の楽曲",
                author: authorEl && authorEl.value ? authorEl.value : "名無し",
                difficultyType: typeEl && typeEl.value ? typeEl.value : "MASTER",
                difficultyLevel: levelEl && levelEl.value ? levelEl.value : "30",
                comment: commentEl && commentEl.value ? commentEl.value : "",
                videoId: currentVideoId // ★ ここで動画IDをJSONのmetaに組み込みます！
            };

            window.GameAudio.metaData = meta;

            const outputPackage = {
                meta: window.GameAudio.metaData,
                notes: window.GameAudio.notesData
            };

            const jsonStr = JSON.stringify(outputPackage, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const difficultyString = `${meta.difficultyType}_Lv${meta.difficultyLevel}`;
            const fileName = `${meta.title}-${meta.author}-${difficultyString}.json`;

            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            
            console.log("動画IDを含めてエクスポートしました:", outputPackage);
        },
importChartWithMeta(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    if (data.meta && data.notes) {
                        window.GameAudio.metaData = data.meta;
                        window.GameAudio.notesData = data.notes;
                        
                        // ★ JSONから動画IDを読み取って、現在の動画IDを上書き
                        if (data.meta.videoId) {
                            window.GameAudio.currentVideoId = data.meta.videoId;
                            
                            // もしYouTubeプレイヤーの動画を切り替える関数（例: loadVideoById）があればここで呼ぶ
                            if (window.GameAudio.player && typeof window.GameAudio.player.loadVideoById === 'function') {
                                window.GameAudio.player.loadVideoById(data.meta.videoId);
                                // 自動再生されないように一時停止
                                setTimeout(() => {
                                    if (window.GameAudio.player.pauseVideo) window.GameAudio.player.pauseVideo();
                                }, 500);
                            } else {
                                // プレイヤーがまだ未生成なら、URL入力欄に自動でIDをセットしておく
                                const urlInput = document.getElementById('youtube-url');
                                if (urlInput) urlInput.value = `https://www.youtube.com/watch?v=${data.meta.videoId}`;
                            }
                        }
                    } else if (Array.isArray(data)) {
                        window.GameAudio.notesData = data;
                        window.GameAudio.metaData = { title: "インポート楽曲", author: "不明", difficultyType: "MASTER", difficultyLevel: "30", comment: "", videoId: "eWBjxT54RQA" };
                    }

                    this.sortAndRefreshTimeline();
                    this.resetLive();

                    // 確認用ダイアログを表示
                    this.openMetaDialog(true); 

                } catch (err) {
                    alert('JSONファイルの読み込みに失敗しました。');
                    console.error(err);
                }
            };
            reader.readAsText(file);
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
            // ★エフェクト改良：単発用の 'active-tap' だけでなく、維持用の 'active-hold' を付与
            if (laneEl) {
                const effectZone = laneEl.querySelector('.lane-effect-zone');
                if (effectZone) {
                    effectZone.classList.add('active-tap', 'active-hold');
                } else {
                    laneEl.classList.add('active-tap', 'active-hold');
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
            // ★エフェクト解除：すべての発光状態・ホールド状態のクラスを完全に消去
            if (laneEl) {
                laneEl.classList.remove('active-tap', 'active-slide', 'active-hold');
                const effectZone = laneEl.querySelector('.lane-effect-zone');
                if (effectZone) {
                    effectZone.classList.remove('active-tap', 'active-slide', 'active-hold');
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
            this.score = 0;         // スコア初期化
            this.currentLife = 1000; // ライフ満タン
            
            const scoreValEl = document.getElementById('score-val');
            if (scoreValEl) scoreValEl.textContent = '00000000';

            const lifeBarEl = document.getElementById('life-bar');
            if (lifeBarEl) {
                lifeBarEl.style.width = '100%';
                lifeBarEl.style.background = 'linear-gradient(to right, #00ffaa, #00ff55)';
            }

            document.getElementById('combo-display').textContent = '0 COMBO';
            document.getElementById('judgment-display').textContent = '';
            if (window.GameAudio && window.GameAudio.notesData) {
                window.GameAudio.notesData.forEach(n => {
                    n.judged = false;
                    n.holdStarted = false; 
                });
            }
        },

// ライフの初期値や最大値を管理するプロパティを上部（judgmentsの近くなど）にない場合は自動で参照します
        // ここでは最大ライフを 1000 として計算します。
        currentLife: 1000,
        maxLife: 1000,

        judgeOnPress(lane, currentTime) {
            if (!window.GameAudio || !window.GameAudio.notesData) return;
            
            const targetNote = window.GameAudio.notesData.find(note => 
                note.lane === lane && !note.judged && note.type === 'tap' && Math.abs(note.time - currentTime) <= this.judgments.miss
            );

            if (!targetNote) return;

            const rating = this.calculateRating(targetNote.time, currentTime);
            targetNote.judged = true;

            // ★スコアとライフの計算・反映
            this.updateScoreAndLife(rating);

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

            // ★スコアとライフの計算・反映
            this.updateScoreAndLife(rating);

            if (rating !== 'MISS') {
                this.combo++;
            } else {
                this.combo = 0;
            }

            this.displayJudgment(rating, this.getRatingClass(rating));
        },

        // ★新規追加：スコアとライフを計算して画面を書き換える関数
        updateScoreAndLife(rating) {
            // 1. 判定ごとのスコア・ライフ増減値の設定
            let scorePlus = 0;
            let lifeChange = 0;

            if (rating === 'PERFECT') {
                scorePlus = 1000;
                lifeChange = 10; // ライフ回復
            } else if (rating === 'GREAT') {
                scorePlus = 750;
                lifeChange = 5;
            } else if (rating === 'GOOD') {
                scorePlus = 500;
                lifeChange = 0; // GOODはキープ
            } else if (rating === 'MISS') {
                scorePlus = 0;
                lifeChange = -100; // MISSで大幅減少
            }

            // 2. スコアの加算と表示更新
            this.score += scorePlus;
            const scoreValEl = document.getElementById('score-val');
            if (scoreValEl) {
                // プロセカ風に8桁のゼロ埋め (例: 00015000) にして表示
                scoreValEl.textContent = String(this.score).padStart(8, '0');
            }

            // 3. ライフの計算と制限 (0〜1000の間)
            if (this.currentLife === undefined) this.currentLife = 1000;
            this.currentLife += lifeChange;
            if (this.currentLife > this.maxLife) this.currentLife = this.maxLife;
            if (this.currentLife < 0) this.currentLife = 0;

            // 4. ライフバー（緑色のバー）の長さを変更
            const lifeBarEl = document.getElementById('life-bar');
            if (lifeBarEl) {
                const lifePercentage = (this.currentLife / this.maxLife) * 100;
                lifeBarEl.style.width = `${lifePercentage}%`;

                // ライフが少なくなったらバーの色を赤っぽくする演出（お好みで）
                if (lifePercentage < 30) {
                    lifeBarEl.style.background = 'linear-gradient(to right, #ff3b30, #ff453a)';
                    lifeBarEl.style.boxShadow = '0 0 8px #ff453a';
                } else {
                    lifeBarEl.style.background = 'linear-gradient(to right, #00ffaa, #00ff55)';
                    lifeBarEl.style.boxShadow = '0 0 8px #00ff55';
                }
            }
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
                    this.updateScoreAndLife('MISS'); // ★見逃しMISSでもライフを減らす
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
