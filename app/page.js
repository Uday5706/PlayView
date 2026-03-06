'use client'
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { 
  RotateCw, Play, Pause, Maximize, 
  ListVideo, Focus, Volume2, VolumeX, MapPin,
  SkipForward, SkipBack // <-- ADD THESE TWO
} from "lucide-react";

const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2];

export default function Home() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [playlistName, setPlaylistName] = useState("");
  const [videos, setVideos] = useState([]);
  const [link, setLink] = useState("");
  const [currentVideo, setCurrentVideo] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(PLAYBACK_SPEEDS[0]);
  
  // --- NEW FEATURE STATE ---
  // Controls how many videos are loaded into One-Shot mode
  const [oneShotLimit, setOneShotLimit] = useState(0); 

  const [isOneShotMode, setIsOneShotMode] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [globalProgress, setGlobalProgress] = useState(0); 
  const [totalGlobalDuration, setTotalGlobalDuration] = useState(0); 

  const playerRef = useRef(null);
  const rateRef = useRef(playbackRate);
  const progressIntervalRef = useRef(null);
  
  // --- BUG FIX REF ---
  // Instantly tracks progress to prevent the "2-hour jump" on rapid key presses
  const globalProgressRef = useRef(0);

  useEffect(() => { rateRef.current = playbackRate; }, [playbackRate]);
  useEffect(() => { globalProgressRef.current = globalProgress; }, [globalProgress]);

  // --- MEMOIZED ACTIVE VIDEOS ---
  // This cleanly slices the playlist for One-Shot mode without duplicating state arrays.
  // useMemo prevents infinite re-renders by only recalculating when inputs change.
// --- MEMOIZED ACTIVE VIDEOS ---
  const activeVideos = useMemo(() => {
    const limit = Number(oneShotLimit); // Safely convert to number
    return isOneShotMode && limit > 0 ? videos.slice(0, limit) : videos;
  }, [isOneShotMode, oneShotLimit, videos]);

  const totalVideos = activeVideos.length;
  const currentVideoObj = activeVideos.find(v => v.id === currentVideo);
  const currentVideoIndex = currentVideoObj ? activeVideos.findIndex(v => v.id === currentVideo) : 0;
  const playlistProgressPercentage = totalVideos > 0 ? ((currentVideoIndex + 1) / totalVideos) * 100 : 0;

  // Calculate Chapters based on ACTIVE videos
  let accumulatedTime = 0;
  const oneShotChapters = activeVideos.map((v) => {
    const start = accumulatedTime;
    accumulatedTime += v.durationSeconds;
    return { ...v, globalStartTime: start, globalEndTime: accumulatedTime };
  });

  // --- ONE-SHOT NAVIGATION CONTROLS ---
  const skipToNextChapter = () => {
    if (currentVideoIndex < activeVideos.length - 1) {
      const nextChapterStart = oneShotChapters[currentVideoIndex + 1].globalStartTime;
      seekToGlobalTime(nextChapterStart);
    } else {
      // If it's the last video, just skip to the very end
      seekToGlobalTime(totalGlobalDuration);
    }
  };

  const skipToPrevChapter = () => {
    const currentChapter = oneShotChapters[currentVideoIndex];
    if (!currentChapter) return;
    
    // Check how far we are into the current video
    const timeInCurrent = globalProgressRef.current - currentChapter.globalStartTime;

    if (timeInCurrent > 3 || currentVideoIndex === 0) {
      // Restart current video
      seekToGlobalTime(currentChapter.globalStartTime);
    } else {
      // Jump to previous video
      const prevChapterStart = oneShotChapters[currentVideoIndex - 1].globalStartTime;
      seekToGlobalTime(prevChapterStart);
    }
  };

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  }, []);

  // Use activeVideos for total duration
  useEffect(() => {
    if (activeVideos.length > 0) {
      setTotalGlobalDuration(activeVideos.reduce((acc, v) => acc + v.durationSeconds, 0));
    }
  }, [activeVideos]);

  const seekToGlobalTime = useCallback((newGlobalTime) => {
    setGlobalProgress(newGlobalTime);
    globalProgressRef.current = newGlobalTime; // Instant update prevents arrow-key lag
    
    // Safety check: Prevent seeking past the very end
    if (newGlobalTime >= totalGlobalDuration && totalGlobalDuration > 0) {
        const lastVid = activeVideos[activeVideos.length - 1];
        if (lastVid.id !== currentVideo) setCurrentVideo(lastVid.id);
        if (playerRef.current) playerRef.current.seekTo(lastVid.durationSeconds, true);
        return;
    }

    let accumTime = 0;
    let targetVideoIndex = 0;
    let relativeTimeInVideo = 0;

    for (let i = 0; i < activeVideos.length; i++) {
      if (accumTime + activeVideos[i].durationSeconds > newGlobalTime) {
        targetVideoIndex = i;
        relativeTimeInVideo = newGlobalTime - accumTime;
        break;
      }
      accumTime += activeVideos[i].durationSeconds;
    }

    const targetVideo = activeVideos[targetVideoIndex];

    if (targetVideo && targetVideo.id !== currentVideo) {
      setCurrentVideo(targetVideo.id);
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
        playerRef.current.loadVideoById({ videoId: targetVideo.id, startSeconds: relativeTimeInVideo });
      }
    } else {
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(relativeTimeInVideo, true);
      }
    }
  }, [activeVideos, currentVideo, totalGlobalDuration]);

  // --- UPDATED KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const player = playerRef.current;
      if (!player || typeof player.getPlayerState !== 'function') return;

      switch (e.key.toLowerCase()) {
        case ' ': 
          e.preventDefault(); 
          if (player.getPlayerState() === window.YT.PlayerState.PLAYING) {
            player.pauseVideo(); setIsPlaying(false);
          } else {
            player.playVideo(); setIsPlaying(true);
          }
          break;
        case 'k': 
          e.preventDefault();
          if (isPlaying) { player.pauseVideo(); setIsPlaying(false); } 
          else { player.playVideo(); setIsPlaying(true); }
          break;
        case 'arrowright': 
          e.preventDefault();
          if (isOneShotMode) seekToGlobalTime(Math.min(totalGlobalDuration, globalProgressRef.current + 10));
          else player.seekTo(player.getCurrentTime() + 10, true);
          break;
        case 'arrowleft': 
          e.preventDefault();
          if (isOneShotMode) seekToGlobalTime(Math.max(0, globalProgressRef.current - 10));
          else player.seekTo(player.getCurrentTime() - 10, true);
          break;
        case 'm': 
          e.preventDefault();
          if (isMuted) { player.unMute(); setIsMuted(false); } 
          else { player.mute(); setIsMuted(true); }
          break;
        case 'f': 
          e.preventDefault();
          const container = document.getElementById('player-container');
          if (!document.fullscreenElement) container.requestFullscreen();
          else document.exitFullscreen();
          break;
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOneShotMode, totalGlobalDuration, seekToGlobalTime, isPlaying, isMuted]);

  // Polling for Global Progress
  useEffect(() => {
    if (isOneShotMode && isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return; 
        const currentTime = playerRef.current.getCurrentTime();
        let passedTime = 0;
        for (let i = 0; i < currentVideoIndex; i++) passedTime += activeVideos[i].durationSeconds;
        setGlobalProgress(passedTime + currentTime);
      }, 500);
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
    return () => { if (progressIntervalRef.current) clearInterval(progressIntervalRef.current); };
  }, [isOneShotMode, isPlaying, currentVideoIndex, activeVideos]);

  const handleGlobalScrub = (e) => seekToGlobalTime(parseFloat(e.target.value));

  const updatePlaybackSpeed = useCallback((newSpeed) => {
    setPlaybackRate(newSpeed);
    if (playerRef.current && playerRef.current.setPlaybackRate) {
        playerRef.current.setPlaybackRate(newSpeed);
    }
  }, []);

  // --- YOUTUBE PLAYER INIT ---
  useEffect(() => {
    if (window.YT && window.YT.Player && currentVideo) {
      const initPlayer = () => {
        if (playerRef.current) playerRef.current.destroy();
        playerRef.current = new window.YT.Player("youtube-player", {
          videoId: currentVideo,
          playerVars: { rel: 0, modestbranding: 1, controls: isOneShotMode ? 0 : 1, disablekb: isOneShotMode ? 1 : 0 },
          events: {
            'onReady': (event) => {
              event.target.setPlaybackRate(rateRef.current);
              if (autoplay) event.target.playVideo();
            },
            'onStateChange': (event) => {
              if (event.data === window.YT.PlayerState.PLAYING) {
                setIsPlaying(true); event.target.setPlaybackRate(rateRef.current);
              } else setIsPlaying(false);
              
              if (event.data === window.YT.PlayerState.ENDED && autoplay) {
                // Safely jump to next video using activeVideos boundary
                const nextIdx = currentVideoIndex + 1;
                if (nextIdx < activeVideos.length) {
                  setCurrentVideo(activeVideos[nextIdx].id);
                  playerRef.current.loadVideoById(activeVideos[nextIdx].id); 
                }
              }
            },
          },
        });
      };
      if (playerRef.current && playerRef.current.getIframe()) {
        const iframeSrc = playerRef.current.getIframe().src;
        if ((iframeSrc.includes('controls=0') ? 0 : 1) === (isOneShotMode ? 0 : 1)) {
          const videoData = playerRef.current.getVideoData();
          if (videoData && videoData.video_id !== currentVideo) playerRef.current.loadVideoById(currentVideo);
        } else initPlayer(); 
      } else initPlayer(); 
    }
  }, [currentVideo, isOneShotMode, activeVideos, autoplay, currentVideoIndex]); 

  // ... (Keep your togglePlayPause, toggleMute, formatSeconds, parseDuration, fetch details functions exact same here)
  const togglePlayPause = () => {
    if (!playerRef.current) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };
  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) playerRef.current.unMute();
    else playerRef.current.mute();
    setIsMuted(!isMuted);
  };
  const toggleFullscreen = () => {
    const playerContainer = document.getElementById('player-container');
    if (!document.fullscreenElement) playerContainer.requestFullscreen().catch(err => console.log(err));
    else document.exitFullscreen();
  };

  function parseDuration(isoString) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoString.match(regex);
    if (!matches) return { formatted: "0:00", seconds: 0 }; 
    const hours = matches[1] ? parseInt(matches[1], 10) : 0;
    const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
    const seconds = matches[3] ? parseInt(matches[3], 10) : 0;
    const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
    const s = String(seconds).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');
    const formatted = hours > 0 ? `${hours}:${m}:${s}` : `${minutes}:${s}`;
    return { formatted, seconds: totalSeconds };
  }

  async function fetchPlaylistDetails(playlistId, apiKey) {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`);
    const data = await res.json();
    if (!data.items || data.items.length === 0) return { title: "Unknown Playlist" };
    return { title: data.items[0].snippet.title };
  }

  async function fetchAllPlaylistVideos(playlistId, apiKey) {
    let videoSnippets = [];
    let nextPageToken = "";
    do {
      const playlistResponse = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&pageToken=${nextPageToken}&key=${apiKey}`);
      const playlistData = await playlistResponse.json();
      if (playlistData.error) throw new Error(playlistData.error.message); 
      if (!playlistData.items) break; 
      videoSnippets.push(
        ...playlistData.items
          .filter(item => item.snippet && item.contentDetails && item.snippet.thumbnails) 
          .map((item) => ({
            id: item.contentDetails.videoId,
            title: item.snippet.title,
            thumbnail: item.snippet.thumbnails?.medium?.url || "https://placehold.co/160x90/000000/FFFFFF?text=No+Img", 
          }))
      );
      nextPageToken = playlistData.nextPageToken || ""; 
    } while (nextPageToken);

    if (videoSnippets.length === 0) return []; 
    const allVideoIds = videoSnippets.map(v => v.id);
    const videoDetailsMap = new Map();
    
    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batchIds = allVideoIds.slice(i, i + 50);
      const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batchIds.join(",")}&key=${apiKey}`);
      const videoData = await videoResponse.json();
      if (videoData.items) {
        videoData.items.forEach(item => {
          videoDetailsMap.set(item.id, parseDuration(item.contentDetails.duration));
        });
      }
    }
    return videoSnippets.map((snippet, index) => ({
      ...snippet,
      index: index + 1, 
      durationFormatted: videoDetailsMap.get(snippet.id)?.formatted || "0:00", 
      durationSeconds: videoDetailsMap.get(snippet.id)?.seconds || 0, 
    }));
  }

  async function handleFetch() {
    const match = link.match(/[?&]list=([^#\&\?]+)/);
    const id = match ? match[1] : null;
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    if (!id) { setError("Invalid link."); return; }
    setLoading(true); setError("");

    try {
      const vids = await fetchAllPlaylistVideos(id, apiKey);
      if (!vids.length) throw new Error("No videos found."); 
      setVideos(vids);
      setOneShotLimit(vids.length); // Initialize limit to full playlist
      setCurrentVideo(vids[0].id); 
      const details = await fetchPlaylistDetails(id, apiKey);
      setPlaylistName(details.title);
    } catch (err) {
      setError("Failed to fetch. Check API key or link.");
    } finally {
      setLoading(false);
    }
  }

  const formatSeconds = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
  };

  return (
    <div className="bg-gray-950 min-h-screen text-white font-sans flex flex-col relative">
      <nav className="w-full sticky top-0 h-auto sm:h-[70px] min-h-[60px] bg-gray-950 flex flex-wrap items-center justify-between py-3 px-3 md:px-6 shadow-xl z-50 border-b border-gray-800 gap-3">
        <h1 className="text-lg md:text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent whitespace-nowrap">
          Play-View
        </h1>
        
        <div className="flex flex-1 w-full sm:w-auto max-w-2xl gap-2 order-3 sm:order-none">
          <input
            type="text"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="Paste YouTube playlist link..."
            className="flex-1 min-w-0 p-2 rounded-lg bg-gray-800 border border-gray-700 focus:border-indigo-500 outline-none text-sm text-gray-200"
          />
          <button onClick={handleFetch} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 md:px-6 py-2 rounded-lg disabled:opacity-50 text-sm font-medium">
            {loading ? "..." : "Load"}
          </button>
        </div>

        {videos.length > 0 && (
          <div className="flex gap-2 bg-gray-800 p-1 rounded-lg border border-gray-700 shrink-0">
            {/* NEW: Custom Limit Input for One-Shot mode */}
            {isOneShotMode && (
              <div 
                className="flex items-center gap-1.5 bg-gray-900 text-xs text-white border border-gray-600 rounded px-2 py-1" 
                title="Set custom number of videos for One-Shot"
              >
                <span className="text-gray-400 font-medium">Limit:</span>
                <input
                  type="number"
                  min="1"
                  max={videos.length}
                  value={oneShotLimit}
                  onChange={(e) => {
                    // Allow the field to be empty temporarily while typing
                    if (e.target.value === "") {
                      setOneShotLimit("");
                      return;
                    }
                    // Parse the number and restrict it to valid bounds
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      setOneShotLimit(Math.min(Math.max(val, 1), videos.length));
                    }
                  }}
                  onBlur={(e) => {
                    // If the user clicks away while the input is empty, reset to total videos
                    if (!e.target.value || e.target.value < 1) {
                      setOneShotLimit(videos.length);
                    }
                  }}
                  className="bg-transparent outline-none w-10 text-center font-mono text-indigo-300 placeholder-gray-500"
                />
                <span className="text-gray-400 font-medium">/ {videos.length}</span>
              </div>
            )}

            <button 
              onClick={() => setIsOneShotMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${!isOneShotMode ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              <ListVideo className="w-4 h-4" /> <span className="hidden sm:inline">Playlist</span>
            </button>
            <button 
              onClick={() => setIsOneShotMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs md:text-sm font-medium transition-all ${isOneShotMode ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
            >
              <Focus className="w-4 h-4" /> <span className="hidden sm:inline">One-Shot</span>
            </button>
          </div>
        )}
      </nav>

      <div className={`flex flex-1 w-full items-start ${isOneShotMode ? 'flex-col' : 'flex-col lg:flex-row'}`}>
        <div className={`flex flex-col w-full ${isOneShotMode ? '' : 'lg:w-[65%] xl:w-[70%]'}`}>
          
          <div className={`w-full bg-black shadow-2xl border-b border-gray-800 flex justify-center ${isOneShotMode ? '' : 'lg:sticky lg:top-[70px] z-40'}`}>
            <div 
              id="player-container" 
              className="relative w-full aspect-video bg-black overflow-hidden group"
              style={isOneShotMode ? { maxHeight: 'calc(100vh - 70px)', maxWidth: 'calc((100vh - 70px) * 16 / 9)', margin: '0 auto' } : {}}
            >
              <div id="youtube-player" className="absolute inset-0 w-full h-full pointer-events-auto"></div>
              
              {isOneShotMode && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-12 pb-4 px-4 lg:px-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="flex items-center gap-2 lg:gap-4 mb-3 group/slider">
                    <span className="text-[10px] lg:text-xs font-medium w-10 text-right text-white/90">{formatSeconds(globalProgress)}</span>
                    <div className="relative flex-1 flex items-center h-4">
                      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 lg:h-1.5 flex z-10 pointer-events-none group-hover/slider:h-2 transition-all duration-300">
                        {oneShotChapters.map((chap) => {
                          const widthPct = (chap.durationSeconds / totalGlobalDuration) * 100;
                          const chapEnd = chap.globalStartTime + chap.durationSeconds;
                          let fillPct = 0;
                          if (globalProgress >= chapEnd) fillPct = 100;
                          else if (globalProgress > chap.globalStartTime) {
                            fillPct = ((globalProgress - chap.globalStartTime) / chap.durationSeconds) * 100;
                          }
                          return (
                            <div key={chap.id} style={{ width: `${widthPct}%` }} className="h-full bg-white/20 relative overflow-hidden border-r-[2px] border-black last:border-r-0">
                              <div className="absolute top-0 left-0 h-full bg-indigo-500" style={{ width: `${fillPct}%` }} />
                            </div>
                          );
                        })}
                      </div>
                      <input 
                        type="range" min="0" max={totalGlobalDuration || 1} value={globalProgress} onChange={handleGlobalScrub}
                        className="absolute inset-0 w-full h-full opacity-100 z-20 cursor-pointer appearance-none bg-transparent 
                          [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent 
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-indigo-400 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(99,102,241,0.8)]"
                      />
                    </div>
                    <span className="text-[10px] lg:text-xs font-medium w-10 text-white/90">{formatSeconds(totalGlobalDuration)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {/* --- PLAYBACK CONTROLS --- */}
                    <div className="flex items-center gap-4 lg:gap-6">
                      
                      {/* Previous Chapter Button */}
                      <button onClick={skipToPrevChapter} className="hover:text-indigo-400 transition-colors disabled:opacity-50" title="Previous Video">
                        <SkipBack className="w-4 h-4 lg:w-5 lg:h-5 fill-current" />
                      </button>

                      {/* Play/Pause Button */}
                      <button onClick={togglePlayPause} className="hover:text-indigo-400 transition-colors scale-110">
                        {isPlaying ? <Pause className="w-5 h-5 lg:w-6 lg:h-6 fill-current" /> : <Play className="w-5 h-5 lg:w-6 lg:h-6 fill-current" />}
                      </button>

                      {/* Next Chapter Button */}
                      <button 
                        onClick={skipToNextChapter} 
                        disabled={currentVideoIndex >= activeVideos.length - 1 && globalProgress >= totalGlobalDuration}
                        className="hover:text-indigo-400 transition-colors disabled:opacity-50" 
                        title="Next Video"
                      >
                        <SkipForward className="w-4 h-4 lg:w-5 lg:h-5 fill-current" />
                      </button>

                      {/* Mute Button */}
                      <button onClick={toggleMute} className="hover:text-indigo-400 transition-colors ml-2">
                        {isMuted ? <VolumeX className="w-4 h-4 lg:w-5 lg:h-5" /> : <Volume2 className="w-4 h-4 lg:w-5 lg:h-5" />}
                      </button>

                      {/* Current Topic Title */}
                      <div className="flex items-center gap-2 border-l border-white/20 pl-4 lg:pl-6 hidden sm:flex">
                         <span className="text-xs lg:text-sm font-medium text-white/70 tracking-wide truncate max-w-[150px] lg:max-w-xs">
                           Topic: {currentVideoObj?.title}
                         </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 lg:gap-6">
                      <button onClick={() => updatePlaybackSpeed(PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(playbackRate) + 1) % PLAYBACK_SPEEDS.length])} className="text-xs lg:text-sm font-medium hover:text-indigo-400">
                        {playbackRate}x
                      </button>
                      <button onClick={toggleFullscreen} className="hover:text-indigo-400 transition-colors">
                        <Maximize className="w-4 h-4 lg:w-5 lg:h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-full bg-gray-950 p-4 lg:p-6">
            {isOneShotMode && activeVideos.length > 0 && (
              <div className="w-full">
                <h3 className="text-lg font-bold mb-4 text-white/90 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-indigo-400" />
                  Timeline Chapters
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {oneShotChapters.map((chap, idx) => {
                    const isActive = currentVideo === chap.id;
                    return (
                      <button
                        key={chap.id}
                        onClick={() => seekToGlobalTime(chap.globalStartTime)}
                        className={`p-3 rounded-lg text-left transition-all border group ${
                          isActive 
                            ? 'bg-indigo-600/20 border-indigo-500/50 ring-1 ring-indigo-500' 
                            : 'bg-gray-800 border-gray-700 hover:border-gray-500 hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded transition-colors ${isActive ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-300 group-hover:bg-gray-600'}`}>
                            {formatSeconds(chap.globalStartTime)} - {formatSeconds(chap.globalEndTime)}
                          </span>
                        </div>
                        <p className={`text-sm font-medium line-clamp-2 transition-colors ${isActive ? 'text-indigo-300' : 'text-gray-300 group-hover:text-white'}`}>
                          {idx + 1}. {chap.title}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            
            {!isOneShotMode && totalVideos > 0 && (
              <div className="w-full bg-gray-900 p-4 rounded-xl border border-gray-800">
                 <div className="flex justify-between text-sm text-gray-400 mb-2">
                   <span>Playlist Completion</span>
                   <span className="font-medium text-white">{currentVideoIndex + 1} of {totalVideos}</span>
                 </div>
                 <div className="w-full bg-gray-700 rounded-full h-1.5">
                   <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${playlistProgressPercentage}%` }}></div>
                 </div>
              </div>
            )}
          </div>
        </div>

        {!isOneShotMode && activeVideos.length > 0 && (
          <div className="w-full lg:w-[35%] xl:w-[30%] bg-gray-950 border-t lg:border-t-0 lg:border-l border-gray-800 flex flex-col">
            <div className="sticky top-[70px] z-30 p-3 lg:p-4 border-b border-gray-800 bg-gray-950 flex justify-between items-center">
              <h2 className="text-base font-semibold truncate pr-2">{playlistName || "Playlist Queue"}</h2>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => updatePlaybackSpeed(PLAYBACK_SPEEDS[(PLAYBACK_SPEEDS.indexOf(playbackRate) + 1) % PLAYBACK_SPEEDS.length])} className="text-xs font-mono bg-gray-800 px-2 py-1 rounded hover:bg-gray-700 border border-gray-700">
                  {playbackRate}x
                </button>
                <button onClick={() => setAutoplay(!autoplay)} className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${autoplay ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-800 text-gray-400'}`}>
                   <RotateCw className={`w-3.5 h-3.5 ${autoplay && 'animate-spin-slow'}`} /> Auto
                </button>
              </div>
            </div>

            <div className="p-2 lg:p-3 space-y-1.5 h-[200px] overflow-y-auto no-scrollbar">
              {activeVideos.map((v, i) => {
                const isActive = currentVideo === v.id;
                return (
                  <div
                    key={v.id} 
                    onClick={() => setCurrentVideo(v.id)}
                    className={`flex gap-3 p-2 rounded-lg cursor-pointer transition-all group ${isActive ? 'bg-indigo-600/10 border border-indigo-500/30 shadow-[inset_4px_0_0_0_rgba(99,102,241,1)]' : 'hover:bg-gray-800 border border-transparent'}`}
                  >
                    <div className="relative w-28 lg:w-32 aspect-video rounded-md overflow-hidden shrink-0 bg-gray-800">
                      <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover opacity-90 group-hover:opacity-100" />
                      <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] font-bold px-1 rounded backdrop-blur-sm">
                        {v.durationFormatted}
                      </span>
                      {isActive && (
                        <div className="absolute inset-0 bg-indigo-500/20 flex items-center justify-center">
                          <div className="flex gap-1">
                            <span className="w-1 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col py-0.5">
                      <p className={`text-xs md:text-sm font-medium line-clamp-2 leading-snug ${isActive ? 'text-indigo-300' : 'text-gray-300 group-hover:text-white'}`}>
                        {i + 1}. {v.title}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        html { scroll-behavior: smooth; }
        body { margin: 0; padding: 0; background-color: #030712; }
      `}} />
    </div>
  );
}