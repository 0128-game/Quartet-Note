if (typeof window.GameAudio === 'undefined') {
    window.GameAudio = {
        player: null,
        isApiReady: false,
        currentVideoId: 'eWBjxT54RQA', 
        isRecording: false,
        notesData: [], 

        // ★ここに楽曲情報（メタデータ）の初期構造を追加しました！
        metaData: {
            title: "",
            author: "",
            difficultyType: "MASTER", // 前回のHTMLに合わせて初期値をMASTERにしています
            difficultyLevel: "30",   // 前回のHTMLに合わせて初期値を30にしています
            comment: ""
        },        init() {
            // YouTube IFrame APIのバインド強化
            if (window.YT && window.YT.Player) {
                this.isApiReady = true;
                this.loadPlayer(this.currentVideoId);
            } else {
                // APIがまだロードされていない場合は、グローバルに待機関数を登録
                const previousReady = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = () => {
                    if (typeof previousReady === 'function') previousReady();
                    this.isApiReady = true;
                    this.loadPlayer(this.currentVideoId);
                };
            }

            // 動画読み込みボタン
            const loadBtn = document.getElementById('btn-load-video');
            if (loadBtn) {
                loadBtn.addEventListener('click', () => {
                    const url = document.getElementById('youtube-url').value;
                    const videoId = this.extractVideoId(url);
                    if (videoId) {
                        this.currentVideoId = videoId;
                        this.loadPlayer(videoId);
                    } else {
                        alert('有効なYouTubeのURLを入力してください。');
                    }
                });
            }

            // 譜面エクスポート
            const exportBtn = document.getElementById('btn-export');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportChart());
            }

            // 譜面インポート
            const importFile = document.getElementById('file-import');
            if (importFile) {
                importFile.addEventListener('change', (e) => this.importChart(e));
            }
        },

        loadPlayer(videoId) {
            if (!this.isApiReady || !window.YT || !window.YT.Player) {
                setTimeout(() => this.loadPlayer(videoId), 200);
                return;
            }

            try {
                if (this.player) {
                    this.player.destroy();
                    this.player = null;
                }

                const currentOrigin = window.location.origin;

                this.player = new YT.Player('youtube-player', {
                    videoId: videoId,
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: 0,
                        playsinline: 1,
                        controls: 1, 
                        disablekb: 1,
                        rel: 0,
                        origin: currentOrigin 
                    },
                    events: {
                        onReady: (event) => {
                            console.log('YouTube Player Ready:', videoId);
                            event.target.unMute();
                        },
                        onStateChange: (event) => {
                            // 再生状態が変わったことを game.js（全体の進行）側に伝えるためのフック
                            if (window.GameManager && typeof window.GameManager.onPlayerStateChange === 'function') {
                                window.GameManager.onPlayerStateChange(event.data);
                            }
                        },
                        onError: (e) => {
                            console.error('YouTube Player Error:', e.data);
                            if (e.data === 150 || e.data === 101) {
                                alert('この動画は埋め込み再生が許可されていません。他の動画URLを試してください。');
                            }
                        }
                    }
                });
            } catch (err) {
                console.error('Player initialization failed:', err);
            }
        },

        extractVideoId(url) {
            if (!url) return null;
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        },

        // ★ミリ秒精度の取得を確実にする
        getCurrentTimeMs() {
            if (!this.player || typeof this.player.getCurrentTime !== 'function') return 0;
            return Math.floor(this.player.getCurrentTime() * 1000);
        },

        // 外部（game.jsなど）から、YouTubeの再生状態（再生中かどうか）を取得しやすくする
        isPlaying() {
            if (!this.player || typeof this.player.getPlayerState !== 'function') return false;
            return this.player.getPlayerState() === 1; // 1 は再生中 (YT.PlayerState.PLAYING)
        },

        play() {
            if (this.player && typeof this.player.playVideo === 'function') {
                this.player.playVideo();
            }
        },

        pause() {
            if (this.player && typeof this.player.pauseVideo === 'function') {
                this.player.pauseVideo();
            }
        },

        seekTo(ms) {
            if (this.player && typeof this.player.seekTo === 'function') {
                this.player.seekTo(ms / 1000, true);
            }
        },

        recordNote(lane, type) {
            if (!this.isRecording) return;

            const currentTime = this.getCurrentTimeMs();
            // 50ms以内の同一レーンの重複タップをガード
            const isDuplicate = this.notesData.some(note => 
                note.lane === lane && Math.abs(note.time - currentTime) < 50
            );

            if (!isDuplicate) {
                this.notesData.push({
                    time: currentTime,
                    lane: parseInt(lane, 10),
                    type: type // 'tap' や 'slide' など
                });
                this.notesData.sort((a, b) => a.time - b.time);
                
                // タイムライン更新の呼び出し先を統一的にハンドリングできるように調整可能にする
                if (window.GameVisuals && typeof window.GameVisuals.updateTimeline === 'function') {
                    window.GameVisuals.updateTimeline();
                } else if (window.GameManager && typeof window.GameManager.updateTimeline === 'function') {
                    window.GameManager.updateTimeline();
                }
            }
        },

        exportChart() {
            if (this.notesData.length === 0) {
                alert('エクスポートする譜面データがありません。');
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
                        
                        this.loadPlayer(this.currentVideoId);
                        
                        // インポート後にゲーム側に譜面データを渡すための架け橋
                        if (window.GameManager && typeof window.GameManager.loadChart === 'function') {
                            window.GameManager.loadChart(this.notesData);
                        }
                        
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

    window.GameAudio.init();
}
