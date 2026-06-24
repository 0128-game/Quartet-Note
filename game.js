// ゲーム全体の挙動・描画を管理するオブジェクト
const GameCore = {
    currentMode: 'play', // 'play', 'record', 'edit'
    score: 0,
    combo: 0,
    maxCombo: 0,
    
    // ノーツが画面奥から判定ラインに到達するまでの時間（ミリ秒）
    // 値を小さくするとノーツの流れる速度が速くなります
    noteSpeedMs: 1000, 
    
    // 判定の許容誤差（ミリ秒）
    judgments: {
        perfect: 40,
        great: 80,
        good: 130,
        miss: 200
    },

    // レーンとキーの対応マップ
    keyMap: { 'd': 0, 'f': 1, 'j': 2, 'k': 3 },
    // ノーツの種類（recordモード中に切り替え可能。Shiftキーでトグル）
    currentRecordType: 'tap', 

    init() {
        this.setupEventListeners();
        this.startGameLoop();
    },

    setupEventListeners() {
        // モード切替ボタン
        const btnPlay = document.getElementById('btn-mode-play');
        const btnRecord = document.getElementById('btn-mode-record');
        const btnEdit = document.getElementById('btn-mode-edit');
        const editorPanel = document.getElementById('editor-panel');

        btnPlay.addEventListener('click', () => this.switchMode('play'));
        btnRecord.addEventListener('click', () => this.switchMode('record'));
        btnEdit.addEventListener('click', () => this.switchMode('edit'));

        // キーボード入力イベント
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                const lane = this.keyMap[key];
                this.handleInput(lane);
            }
            // Recordモード中、Shiftキーでノーツタイプを切り替え
            if (e.key === 'Shift' && this.currentMode === 'record') {
                this.currentRecordType = this.currentRecordType === 'tap' ? 'slide' : 'tap';
                console.log(`記録ノーツタイプ変更: ${this.currentRecordType}`);
            }
            // スペースキーで再生/一時停止
            if (e.key === ' ') {
                e.preventDefault();
                if (GameAudio.player && GameAudio.player.getPlayerState() === 1) {
                    GameAudio.pause();
                } else {
                    GameAudio.play();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                const lane = this.keyMap[key];
                document.getElementById(`lane-${lane}`).classList.remove('active-tap', 'active-slide');
            }
        });

        // 画面タッチ・クリック操作（各レーンへのイベント付与）
        for (let i = 0; i < 4; i++) {
            const laneEl = document.getElementById(`lane-${i}`);
            // マウス/タッチ両対応
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

    // モード切り替えロジック
    switchMode(mode) {
        this.currentMode = mode;
        
        document.getElementById('btn-mode-play').classList.remove('active');
        document.getElementById('btn-mode-record').classList.remove('active');
        document.getElementById('btn-mode-edit').classList.remove('active');
        document.getElementById('editor-panel').classList.add('hidden');
        document.getElementById('combo-display').classList.add('hidden');
        
        GameAudio.isRecording = false;

        if (mode === 'play') {
            document.getElementById('btn-mode-play').classList.add('active');
            document.getElementById('combo-display').classList.remove('hidden');
            this.resetLive();
        } else if (mode === 'record') {
            document.getElementById('btn-mode-record').classList.add('active');
            GameAudio.isRecording = true;
            alert('録音モード: スペースキーまたは画面タップで音楽が始まります。DFJKでノーツを記録、Shiftでタップ/スライド切り替え。');
        } else if (mode === 'edit') {
            document.getElementById('btn-mode-edit').classList.add('active');
            document.getElementById('editor-panel').classList.remove('hidden');
            GameVisuals.updateTimeline();
        }
    },

    resetLive() {
        this.combo = 0;
        document.getElementById('combo-display').textContent = '0 COMBO';
        document.getElementById('judgment-display').textContent = '';
        // 各ノーツの判定済みフラグをリセット
        GameAudio.notesData.forEach(n => n.judged = false);
    },

    // 入力が発生したときの処理（キー or タップ）
    handleInput(lane) {
        // レーン視覚効果
        const laneEl = document.getElementById(`lane-${lane}`);
        const activeClass = this.currentMode === 'record' && this.currentRecordType === 'slide' ? 'active-slide' : 'active-tap';
        laneEl.classList.add(activeClass);

        if (this.currentMode === 'record') {
            // 録音モードならノーツを記録
            GameAudio.recordNote(lane, this.currentRecordType);
        } else if (this.currentMode === 'play') {
            // プレイモードなら判定処理
            this.judgeNote(lane);
        }
    },

    // 判定ロジック
    judgeNote(lane) {
        const currentTime = GameAudio.getCurrentTimeMs();
        
        // まだ判定されていない、該当レーンの最も近いノーツを探す
        const targetNote = GameAudio.notesData.find(note => 
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
        
        display.textContent = text;
        display.className = className;
        
        // 演出用アニメーションリセット
        display.style.transform = 'scale(1.2)';
        setTimeout(() => display.style.transform = 'scale(1.0)', 50);

        comboDisplay.textContent = `${this.combo} COMBO`;
    },

    // 定期的な描画アップデート（ゲームループ）
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

    // プレイ画面へのノーツ描画
    renderNotes() {
        const currentTime = GameAudio.getCurrentTimeMs();
        const lanesContainer = document.getElementById('game-lanes');
        
        // 古いノーツ要素を削除
        const existingNotes = lanesContainer.querySelectorAll('.note');
        existingNotes.forEach(n => n.remove());

        GameAudio.notesData.forEach(note => {
            // 判定済みのノーツは描画しない
            if (note.judged) return;

            // 画面内に存在する時間枠にあるか計算
            const timeDiff = note.time - currentTime;

            if (timeDiff <= this.noteSpeedMs && timeDiff >= -200) {
                // 上部（奥）からの位置割合（0.0 ~ 1.0）
                // 1.0 が判定ライン位置（下部から60px上がターゲット）
                const progress = 1 - (timeDiff / this.noteSpeedMs);
                
                // 3D風に見せるため、下に行くほど加速する2次関数的な配置
                const laneHeight = lanesContainer.clientHeight;
                const targetY = laneHeight * 0.85; // 判定ラインのおおよその位置割合
                const yPosition = targetY * Math.pow(progress, 1.5); 

                const noteEl = document.createElement('div');
                noteEl.className = `note note-${note.type}`;
                noteEl.style.top = `${yPosition}px`;

                // 該当レーンに追加
                const laneEl = document.getElementById(`lane-${note.lane}`);
                laneEl.appendChild(noteEl);
            }
        });
    },

    // 判定ラインを通り過ぎたノーツを自動MISSにする
    checkMissedNotes() {
        const currentTime = GameAudio.getCurrentTimeMs();
        GameAudio.notesData.forEach(note => {
            if (!note.judged && (currentTime - note.time) > this.judgments.miss) {
                note.judged = true;
                this.combo = 0;
                this.displayJudgment('MISS', 'jd-miss');
            }
        });
    }
};

// 画面表示・タイムライン編集用のヘルパーオブジェクト
const GameVisuals = {
    // 調整（エディター）モードのタイムライン生成
    updateTimeline() {
        const container = document.getElementById('timeline-container');
        container.innerHTML = ''; // クリア

        if (GameAudio.notesData.length === 0) {
            container.innerHTML = '<div style="color:#666; padding:20px;">ノーツデータがありません。先に録音してください。</div>';
            return;
        }

        // 横一列に並べるためのラッパー
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.gap = '15px';
        wrapper.style.padding = '10px';
        wrapper.style.width = 'max-content';

        GameAudio.notesData.forEach((note, index) => {
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
                <button style="padding:2px 6px; font-size:10px; background:#cc0000;" onclick="GameVisuals.deleteNote(${index})">削除</button>
            `;

            // 数値が直接書き換えられたら譜面データを更新
            const input = item.querySelector('input');
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                const newTime = parseInt(e.target.value);
                GameAudio.notesData[idx].time = newTime;
                // 再ソート
                GameAudio.notesData.sort((a, b) => a.time - b.time);
                // 自分の位置がずれるので非同期で再描画
                setTimeout(() => GameVisuals.updateTimeline(), 500);
            });

            wrapper.appendChild(item);
        });

        container.appendChild(wrapper);
    },

    deleteNote(index) {
        GameAudio.notesData.splice(index, 1);
        this.updateTimeline();
    }
};

// スクリプト読み込み時に初期化
GameCore.init();
// グローバルにバインド
window.GameVisuals = GameVisuals;// ゲーム全体の挙動・描画を管理するオブジェクト
const GameCore = {
    currentMode: 'play', // 'play', 'record', 'edit'
    score: 0,
    combo: 0,
    maxCombo: 0,
    
    // ノーツが画面奥から判定ラインに到達するまでの時間（ミリ秒）
    // 値を小さくするとノーツの流れる速度が速くなります
    noteSpeedMs: 1000, 
    
    // 判定の許容誤差（ミリ秒）
    judgments: {
        perfect: 40,
        great: 80,
        good: 130,
        miss: 200
    },

    // レーンとキーの対応マップ
    keyMap: { 'd': 0, 'f': 1, 'j': 2, 'k': 3 },
    // ノーツの種類（recordモード中に切り替え可能。Shiftキーでトグル）
    currentRecordType: 'tap', 

    init() {
        this.setupEventListeners();
        this.startGameLoop();
    },

    setupEventListeners() {
        // モード切替ボタン
        const btnPlay = document.getElementById('btn-mode-play');
        const btnRecord = document.getElementById('btn-mode-record');
        const btnEdit = document.getElementById('btn-mode-edit');
        const editorPanel = document.getElementById('editor-panel');

        btnPlay.addEventListener('click', () => this.switchMode('play'));
        btnRecord.addEventListener('click', () => this.switchMode('record'));
        btnEdit.addEventListener('click', () => this.switchMode('edit'));

        // キーボード入力イベント
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                const lane = this.keyMap[key];
                this.handleInput(lane);
            }
            // Recordモード中、Shiftキーでノーツタイプを切り替え
            if (e.key === 'Shift' && this.currentMode === 'record') {
                this.currentRecordType = this.currentRecordType === 'tap' ? 'slide' : 'tap';
                console.log(`記録ノーツタイプ変更: ${this.currentRecordType}`);
            }
            // スペースキーで再生/一時停止
            if (e.key === ' ') {
                e.preventDefault();
                if (GameAudio.player && GameAudio.player.getPlayerState() === 1) {
                    GameAudio.pause();
                } else {
                    GameAudio.play();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                const lane = this.keyMap[key];
                document.getElementById(`lane-${lane}`).classList.remove('active-tap', 'active-slide');
            }
        });

        // 画面タッチ・クリック操作（各レーンへのイベント付与）
        for (let i = 0; i < 4; i++) {
            const laneEl = document.getElementById(`lane-${i}`);
            // マウス/タッチ両対応
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

    // モード切り替えロジック
    switchMode(mode) {
        this.currentMode = mode;
        
        document.getElementById('btn-mode-play').classList.remove('active');
        document.getElementById('btn-mode-record').classList.remove('active');
        document.getElementById('btn-mode-edit').classList.remove('active');
        document.getElementById('editor-panel').classList.add('hidden');
        document.getElementById('combo-display').classList.add('hidden');
        
        GameAudio.isRecording = false;

        if (mode === 'play') {
            document.getElementById('btn-mode-play').classList.add('active');
            document.getElementById('combo-display').classList.remove('hidden');
            this.resetLive();
        } else if (mode === 'record') {
            document.getElementById('btn-mode-record').classList.add('active');
            GameAudio.isRecording = true;
            alert('録音モード: スペースキーまたは画面タップで音楽が始まります。DFJKでノーツを記録、Shiftでタップ/スライド切り替え。');
        } else if (mode === 'edit') {
            document.getElementById('btn-mode-edit').classList.add('active');
            document.getElementById('editor-panel').classList.remove('hidden');
            GameVisuals.updateTimeline();
        }
    },

    resetLive() {
        this.combo = 0;
        document.getElementById('combo-display').textContent = '0 COMBO';
        document.getElementById('judgment-display').textContent = '';
        // 各ノーツの判定済みフラグをリセット
        GameAudio.notesData.forEach(n => n.judged = false);
    },

    // 入力が発生したときの処理（キー or タップ）
    handleInput(lane) {
        // レーン視覚効果
        const laneEl = document.getElementById(`lane-${lane}`);
        const activeClass = this.currentMode === 'record' && this.currentRecordType === 'slide' ? 'active-slide' : 'active-tap';
        laneEl.classList.add(activeClass);

        if (this.currentMode === 'record') {
            // 録音モードならノーツを記録
            GameAudio.recordNote(lane, this.currentRecordType);
        } else if (this.currentMode === 'play') {
            // プレイモードなら判定処理
            this.judgeNote(lane);
        }
    },

    // 判定ロジック
    judgeNote(lane) {
        const currentTime = GameAudio.getCurrentTimeMs();
        
        // まだ判定されていない、該当レーンの最も近いノーツを探す
        const targetNote = GameAudio.notesData.find(note => 
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
        
        display.textContent = text;
        display.className = className;
        
        // 演出用アニメーションリセット
        display.style.transform = 'scale(1.2)';
        setTimeout(() => display.style.transform = 'scale(1.0)', 50);

        comboDisplay.textContent = `${this.combo} COMBO`;
    },

    // 定期的な描画アップデート（ゲームループ）
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

    // プレイ画面へのノーツ描画
    renderNotes() {
        const currentTime = GameAudio.getCurrentTimeMs();
        const lanesContainer = document.getElementById('game-lanes');
        
        // 古いノーツ要素を削除
        const existingNotes = lanesContainer.querySelectorAll('.note');
        existingNotes.forEach(n => n.remove());

        GameAudio.notesData.forEach(note => {
            // 判定済みのノーツは描画しない
            if (note.judged) return;

            // 画面内に存在する時間枠にあるか計算
            const timeDiff = note.time - currentTime;

            if (timeDiff <= this.noteSpeedMs && timeDiff >= -200) {
                // 上部（奥）からの位置割合（0.0 ~ 1.0）
                // 1.0 が判定ライン位置（下部から60px上がターゲット）
                const progress = 1 - (timeDiff / this.noteSpeedMs);
                
                // 3D風に見せるため、下に行くほど加速する2次関数的な配置
                const laneHeight = lanesContainer.clientHeight;
                const targetY = laneHeight * 0.85; // 判定ラインのおおよその位置割合
                const yPosition = targetY * Math.pow(progress, 1.5); 

                const noteEl = document.createElement('div');
                noteEl.className = `note note-${note.type}`;
                noteEl.style.top = `${yPosition}px`;

                // 該当レーンに追加
                const laneEl = document.getElementById(`lane-${note.lane}`);
                laneEl.appendChild(noteEl);
            }
        });
    },

    // 判定ラインを通り過ぎたノーツを自動MISSにする
    checkMissedNotes() {
        const currentTime = GameAudio.getCurrentTimeMs();
        GameAudio.notesData.forEach(note => {
            if (!note.judged && (currentTime - note.time) > this.judgments.miss) {
                note.judged = true;
                this.combo = 0;
                this.displayJudgment('MISS', 'jd-miss');
            }
        });
    }
};

// 画面表示・タイムライン編集用のヘルパーオブジェクト
const GameVisuals = {
    // 調整（エディター）モードのタイムライン生成
    updateTimeline() {
        const container = document.getElementById('timeline-container');
        container.innerHTML = ''; // クリア

        if (GameAudio.notesData.length === 0) {
            container.innerHTML = '<div style="color:#666; padding:20px;">ノーツデータがありません。先に録音してください。</div>';
            return;
        }

        // 横一列に並べるためのラッパー
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.gap = '15px';
        wrapper.style.padding = '10px';
        wrapper.style.width = 'max-content';

        GameAudio.notesData.forEach((note, index) => {
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
                <button style="padding:2px 6px; font-size:10px; background:#cc0000;" onclick="GameVisuals.deleteNote(${index})">削除</button>
            `;

            // 数値が直接書き換えられたら譜面データを更新
            const input = item.querySelector('input');
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                const newTime = parseInt(e.target.value);
                GameAudio.notesData[idx].time = newTime;
                // 再ソート
                GameAudio.notesData.sort((a, b) => a.time - b.time);
                // 自分の位置がずれるので非同期で再描画
                setTimeout(() => GameVisuals.updateTimeline(), 500);
            });

            wrapper.appendChild(item);
        });

        container.appendChild(wrapper);
    },

    deleteNote(index) {
        GameAudio.notesData.splice(index, 1);
        this.updateTimeline();
    }
};

// スクリプト読み込み時に初期化
GameCore.init();
// グローバルにバインド
window.GameVisuals = GameVisuals;// ゲーム全体の挙動・描画を管理するオブジェクト
const GameCore = {
    currentMode: 'play', // 'play', 'record', 'edit'
    score: 0,
    combo: 0,
    maxCombo: 0,
    
    // ノーツが画面奥から判定ラインに到達するまでの時間（ミリ秒）
    // 値を小さくするとノーツの流れる速度が速くなります
    noteSpeedMs: 1000, 
    
    // 判定の許容誤差（ミリ秒）
    judgments: {
        perfect: 40,
        great: 80,
        good: 130,
        miss: 200
    },

    // レーンとキーの対応マップ
    keyMap: { 'd': 0, 'f': 1, 'j': 2, 'k': 3 },
    // ノーツの種類（recordモード中に切り替え可能。Shiftキーでトグル）
    currentRecordType: 'tap', 

    init() {
        this.setupEventListeners();
        this.startGameLoop();
    },

    setupEventListeners() {
        // モード切替ボタン
        const btnPlay = document.getElementById('btn-mode-play');
        const btnRecord = document.getElementById('btn-mode-record');
        const btnEdit = document.getElementById('btn-mode-edit');
        const editorPanel = document.getElementById('editor-panel');

        btnPlay.addEventListener('click', () => this.switchMode('play'));
        btnRecord.addEventListener('click', () => this.switchMode('record'));
        btnEdit.addEventListener('click', () => this.switchMode('edit'));

        // キーボード入力イベント
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                const lane = this.keyMap[key];
                this.handleInput(lane);
            }
            // Recordモード中、Shiftキーでノーツタイプを切り替え
            if (e.key === 'Shift' && this.currentMode === 'record') {
                this.currentRecordType = this.currentRecordType === 'tap' ? 'slide' : 'tap';
                console.log(`記録ノーツタイプ変更: ${this.currentRecordType}`);
            }
            // スペースキーで再生/一時停止
            if (e.key === ' ') {
                e.preventDefault();
                if (GameAudio.player && GameAudio.player.getPlayerState() === 1) {
                    GameAudio.pause();
                } else {
                    GameAudio.play();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            if (this.keyMap.hasOwnProperty(key)) {
                const lane = this.keyMap[key];
                document.getElementById(`lane-${lane}`).classList.remove('active-tap', 'active-slide');
            }
        });

        // 画面タッチ・クリック操作（各レーンへのイベント付与）
        for (let i = 0; i < 4; i++) {
            const laneEl = document.getElementById(`lane-${i}`);
            // マウス/タッチ両対応
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

    // モード切り替えロジック
    switchMode(mode) {
        this.currentMode = mode;
        
        document.getElementById('btn-mode-play').classList.remove('active');
        document.getElementById('btn-mode-record').classList.remove('active');
        document.getElementById('btn-mode-edit').classList.remove('active');
        document.getElementById('editor-panel').classList.add('hidden');
        document.getElementById('combo-display').classList.add('hidden');
        
        GameAudio.isRecording = false;

        if (mode === 'play') {
            document.getElementById('btn-mode-play').classList.add('active');
            document.getElementById('combo-display').classList.remove('hidden');
            this.resetLive();
        } else if (mode === 'record') {
            document.getElementById('btn-mode-record').classList.add('active');
            GameAudio.isRecording = true;
            alert('録音モード: スペースキーまたは画面タップで音楽が始まります。DFJKでノーツを記録、Shiftでタップ/スライド切り替え。');
        } else if (mode === 'edit') {
            document.getElementById('btn-mode-edit').classList.add('active');
            document.getElementById('editor-panel').classList.remove('hidden');
            GameVisuals.updateTimeline();
        }
    },

    resetLive() {
        this.combo = 0;
        document.getElementById('combo-display').textContent = '0 COMBO';
        document.getElementById('judgment-display').textContent = '';
        // 各ノーツの判定済みフラグをリセット
        GameAudio.notesData.forEach(n => n.judged = false);
    },

    // 入力が発生したときの処理（キー or タップ）
    handleInput(lane) {
        // レーン視覚効果
        const laneEl = document.getElementById(`lane-${lane}`);
        const activeClass = this.currentMode === 'record' && this.currentRecordType === 'slide' ? 'active-slide' : 'active-tap';
        laneEl.classList.add(activeClass);

        if (this.currentMode === 'record') {
            // 録音モードならノーツを記録
            GameAudio.recordNote(lane, this.currentRecordType);
        } else if (this.currentMode === 'play') {
            // プレイモードなら判定処理
            this.judgeNote(lane);
        }
    },

    // 判定ロジック
    judgeNote(lane) {
        const currentTime = GameAudio.getCurrentTimeMs();
        
        // まだ判定されていない、該当レーンの最も近いノーツを探す
        const targetNote = GameAudio.notesData.find(note => 
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
        
        display.textContent = text;
        display.className = className;
        
        // 演出用アニメーションリセット
        display.style.transform = 'scale(1.2)';
        setTimeout(() => display.style.transform = 'scale(1.0)', 50);

        comboDisplay.textContent = `${this.combo} COMBO`;
    },

    // 定期的な描画アップデート（ゲームループ）
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

    // プレイ画面へのノーツ描画
    renderNotes() {
        const currentTime = GameAudio.getCurrentTimeMs();
        const lanesContainer = document.getElementById('game-lanes');
        
        // 古いノーツ要素を削除
        const existingNotes = lanesContainer.querySelectorAll('.note');
        existingNotes.forEach(n => n.remove());

        GameAudio.notesData.forEach(note => {
            // 判定済みのノーツは描画しない
            if (note.judged) return;

            // 画面内に存在する時間枠にあるか計算
            const timeDiff = note.time - currentTime;

            if (timeDiff <= this.noteSpeedMs && timeDiff >= -200) {
                // 上部（奥）からの位置割合（0.0 ~ 1.0）
                // 1.0 が判定ライン位置（下部から60px上がターゲット）
                const progress = 1 - (timeDiff / this.noteSpeedMs);
                
                // 3D風に見せるため、下に行くほど加速する2次関数的な配置
                const laneHeight = lanesContainer.clientHeight;
                const targetY = laneHeight * 0.85; // 判定ラインのおおよその位置割合
                const yPosition = targetY * Math.pow(progress, 1.5); 

                const noteEl = document.createElement('div');
                noteEl.className = `note note-${note.type}`;
                noteEl.style.top = `${yPosition}px`;

                // 該当レーンに追加
                const laneEl = document.getElementById(`lane-${note.lane}`);
                laneEl.appendChild(noteEl);
            }
        });
    },

    // 判定ラインを通り過ぎたノーツを自動MISSにする
    checkMissedNotes() {
        const currentTime = GameAudio.getCurrentTimeMs();
        GameAudio.notesData.forEach(note => {
            if (!note.judged && (currentTime - note.time) > this.judgments.miss) {
                note.judged = true;
                this.combo = 0;
                this.displayJudgment('MISS', 'jd-miss');
            }
        });
    }
};

// 画面表示・タイムライン編集用のヘルパーオブジェクト
const GameVisuals = {
    // 調整（エディター）モードのタイムライン生成
    updateTimeline() {
        const container = document.getElementById('timeline-container');
        container.innerHTML = ''; // クリア

        if (GameAudio.notesData.length === 0) {
            container.innerHTML = '<div style="color:#666; padding:20px;">ノーツデータがありません。先に録音してください。</div>';
            return;
        }

        // 横一列に並べるためのラッパー
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.gap = '15px';
        wrapper.style.padding = '10px';
        wrapper.style.width = 'max-content';

        GameAudio.notesData.forEach((note, index) => {
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
                <button style="padding:2px 6px; font-size:10px; background:#cc0000;" onclick="GameVisuals.deleteNote(${index})">削除</button>
            `;

            // 数値が直接書き換えられたら譜面データを更新
            const input = item.querySelector('input');
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'));
                const newTime = parseInt(e.target.value);
                GameAudio.notesData[idx].time = newTime;
                // 再ソート
                GameAudio.notesData.sort((a, b) => a.time - b.time);
                // 自分の位置がずれるので非同期で再描画
                setTimeout(() => GameVisuals.updateTimeline(), 500);
            });

            wrapper.appendChild(item);
        });

        container.appendChild(wrapper);
    },

    deleteNote(index) {
        GameAudio.notesData.splice(index, 1);
        this.updateTimeline();
    }
};

// スクリプト読み込み時に初期化
GameCore.init();
// グローバルにバインド
window.GameVisuals = GameVisuals;
