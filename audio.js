// グローバル管理オブジェクト
const GameAudio = {
    player: null,
    isApiReady: false,
    currentVideoId: 'yv_2yE6jHcw', // デフォルトの動画ID (サンプル)
    isRecording: false,
    notesData: [], // 記録された譜面データ [{time: ミリ秒, lane: 0~3, type: 'tap'|'slide'}]

    // YouTube APIの初期化
    init() {
        // YouTube APIが読み込まれたらグローバル関数から呼ばれる
        window.onYouTubeIframeAPIReady = () => {
            this.isApiReady = true;
            this.loadPlayer(this.currentVideoId);
        };

        // URL読み込みボタンのイベント
        document.getElementById('btn-load-video').addEventListener('click', () => {
            const url = document.getElementById('youtube-url').value;
            const videoId = this.extractVideoId(url);
            if (videoId) {
                this.currentVideoId = videoId;
                this.loadPlayer(videoId);
            } else {
                alert('有効なYouTubeのURLを入力してください。');
            }
        });

        // エクスポート・インポートのイベント設定
        document.getElementById('btn-export').addEventListener('click', () => this.exportChart());
        document.getElementById('file-import').addEventListener('change', (e) => this.importChart(e));
    },

    // プレイヤーの生成・読み込み
    loadPlayer(videoId) {
        if (!this.isApiReady) return;

        // 既存のプレイヤーがある場合は破棄
        if (this.player) {
            this.player.destroy();
        }

        this.player = new YT.Player('youtube-player', {
            videoId: videoId,
            playerVars: {
                playsinline: 1,
                controls: 0, // ゲームに集中するためコントローラーは非表示
                disablekb: 1,
                rel: 0
            },
            events: {
                onReady: () => {
                    console.log('YouTube Player Ready');
                }
            }
        });
    },

    // URLからVideoIDを抽出するユーティリティ
    extractVideoId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    // 現在の再生時間をミリ秒で取得
    getCurrentTimeMs() {
        if (!this.player || typeof this.player.getCurrentTime !== 'function') return 0;
        return Math.floor(this.player.getCurrentTime() * 1000);
    },

    // 動画の再生
    play() {
        if (this.player && typeof this.player.playVideo === 'function') {
            this.player.playVideo();
        }
    },

    // 動画の一時停止
    pause() {
        if (this.player && typeof this.player.pauseVideo === 'function') {
            this.player.pauseVideo();
        }
    },

    // 動画の指定位置へのシーク（ミリ秒）
    seekTo(ms) {
        if (this.player && typeof this.player.seekTo === 'function') {
            this.player.seekTo(ms / 1000, true);
        }
    },

    // 録音モードでのノーツ記録（キー・タップされた時にgame.jsから呼ばれる）
    recordNote(lane, type) {
        if (!this.isRecording) return;

        const currentTime = this.getCurrentTimeMs();
        
        // 重複登録を防ぐ（同じレーンでほぼ同時のノーツは弾く）
        const isDuplicate = this.notesData.some(note => 
            note.lane === lane && Math.abs(note.time - currentTime) < 50
        );

        if (!isDuplicate) {
            this.notesData.push({
                time: currentTime,
                lane: lane,
                type: type
            });
            // 時間順にソート
            this.notesData.sort((a, b) => a.time - b.time);
            
            // タイムラインの表示を更新（game.jsの関数を呼び出す）
            if (window.GameVisuals && typeof window.GameVisuals.updateTimeline === 'function') {
                window.GameVisuals.updateTimeline();
            }
        }
    },

    // 譜面データをJSONとしてエクスポート（ダウンロード）
    exportChart() {
        if (this.notesData.length === 0) {
            alert('エクスポートする譜面データがありません。録音するかインポートしてください。');
            return;
        }

        const outputData = {
            videoId: this.currentVideoId,
            notes: this.notesData
        };

        const jsonString = JSON.stringify(outputData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `chart_${this.currentVideoId}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    },

    // JSON譜面データのインポート
    importChart(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (imported.videoId && Array.isArray(imported.notes)) {
                    this.currentVideoId = imported.videoId;
                    this.notesData = imported.notes;
                    
                    // 動画を再読み込み
                    this.loadPlayer(this.currentVideoId);
                    
                    // タイムラインを更新
                    if (window.GameVisuals && typeof window.GameVisuals.updateTimeline === 'function') {
                        window.GameVisuals.updateTimeline();
                    }
                    
                    alert('譜面のインポートが完了しました！');
                } else {
                    alert('ファイル形式が正しくありません。');
                }
            } catch (err) {
                alert('JSONの解析に失敗しました。');
            }
        };
        reader.readAsText(file);
    }
};

// 初期化を実行
GameAudio.init();
