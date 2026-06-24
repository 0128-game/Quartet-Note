if (typeof window.GameAudio === 'undefined') {
    window.GameAudio = {
        player: null,
        isApiReady: false,
        currentVideoId: 'yv_2yE6jHcw', // デフォルトの動画ID（初音ミクのサンプル等に変更可能）
        isRecording: false,
        notesData: [], 

        init() {
            // すでにYouTube APIのスクリプトがロードされているか、これからロードされるかを監視
            if (window.YT && window.YT.Player) {
                this.isApiReady = true;
                this.loadPlayer(this.currentVideoId);
            } else {
                // APIの準備完了イベントをグローバルに登録
                window.onYouTubeIframeAPIReady = () => {
                    this.isApiReady = true;
                    this.loadPlayer(this.currentVideoId);
                };
            }

            // URL読み込みボタン
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

            // エクスポートボタン
            const exportBtn = document.getElementById('btn-export');
            if (exportBtn) {
                exportBtn.addEventListener('click', () => this.exportChart());
            }

            // インポートボタン
            const importFile = document.getElementById('file-import');
            if (importFile) {
                importFile.addEventListener('change', (e) => this.importChart(e));
            }
        },

        loadPlayer(videoId) {
            // APIがまだ準備できていない場合は、少し待ってから再試行
            if (!this.isApiReady || !window.YT || !window.YT.Player) {
                setTimeout(() => this.loadPlayer(videoId), 200);
                return;
            }

            try {
                // 既存のプレイヤーがある場合は一度破棄して完全に再生成（ドメインエラー・スタック対策）
                if (this.player) {
                    this.player.destroy();
                    this.player = null;
                }

                // 現在のドメイン（GitHub Pages等）を自動取得してoriginに設定
                const currentOrigin = window.location.origin;

                this.player = new YT.Player('youtube-player', {
                    videoId: videoId,
                    width: '100%',
                    height: '100%',
                    playerVars: {
                        autoplay: 0,
                        playsinline: 1,
                        controls: 0, 
                        disablekb: 1,
                        rel: 0,
                        origin: currentOrigin // セキュリティ・読み込みエラーのコア対策
                    },
                    events: {
                        onReady: (event) => {
                            console.log('YouTube Player Ready:', videoId);
                            // ブラウザのミュート強制対策（一部の環境で再生可能にするため）
                            event.target.unMute();
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

        getCurrentTimeMs() {
            if (!this.player || typeof this.player.getCurrentTime !== 'function') return 0;
            return Math.floor(this.player.getCurrentTime() * 1000);
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
            const isDuplicate = this.notesData.some(note => 
                note.lane === lane && Math.abs(note.time - currentTime) < 50
            );

            if (!isDuplicate) {
                this.notesData.push({
                    time: currentTime,
                    lane: lane,
                    type: type
                });
                this.notesData.sort((a, b) => a.time - b.time);
                
                if (window.GameVisuals && typeof window.GameVisuals.updateTimeline === 'function') {
                    window.GameVisuals.updateTimeline();
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
