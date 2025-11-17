'use client'
// Import necessary React hooks and icons
import { useState, useEffect, useRef } from "react";
import { RotateCw } from "lucide-react"; // Icon for autoplay

// Placeholder Navbar component to resolve the import error
// In a real app, this would be in its own file (e.g., components/Navbar.js)
function Navbar() {
  return (
    <nav className="w-full h-[70px] bg-gray-900 text-white flex items-center px-6 shadow-md sticky top-0 z-50">
      <h1 className="text-2xl font-bold">YouTube Playlist Player</h1>
    </nav>
  );
}

// Define the available playback speeds as a constant
const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2];

export default function Home() {
  // State for managing the UI and player
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [playlistName, setPlaylistName] = useState("");
  const [videos, setVideos] = useState([]);
  const [link, setLink] = useState("");
  const [currentVideo, setCurrentVideo] = useState(null);
  
  // State for Playback Speed
  const [playbackRate, setPlaybackRate] = useState(PLAYBACK_SPEEDS[0]);

  // useRef holds a reference to the YouTube player instance
  // This allows us to access the player object directly without causing re-renders
  const playerRef = useRef(null);

  // --- DERIVED STATE FOR PROGRESS BAR ---
  // We calculate these values on every render, so they are always in sync.
  const totalVideos = videos.length;
  // Find the video object that matches the currentVideo ID
  const currentVideoObj = videos.find(v => v.id === currentVideo);
  // Get its 1-based index (or 0 if not found)
  const currentVideoNumber = currentVideoObj ? currentVideoObj.index : 0;
  
  // Calculate the percentage
  const progressPercentage = totalVideos > 0 ? (currentVideoNumber / totalVideos) * 100 : 0;
  // --- END DERIVED STATE ---

  // useEffect to load the YouTube IFrame API script
  useEffect(() => {
    // Check if the API script is already loaded
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      // This inserts the script tag into the HTML body
      document.body.appendChild(tag);
    }
  }, []); // Empty dependency array means this runs only once on component mount

  // useEffect to create, manage, and destroy the YouTube player
  useEffect(() => {
    // This effect runs when the YouTube API is ready (window.YT) and we have a video to play
    if (window.YT && window.YT.Player && currentVideo) {
      
      // If a player instance already exists, destroy it before creating a new one
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
      
      // Create the new player instance
      // It replaces the <div> with id "youtube-player"
      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: currentVideo, // The video ID to play
        playerVars: {
          rel: 0, // Don't show related videos at the end
          modestbranding: 1, // Minimal YouTube branding
        },
        events: {
          'onReady': (event) => {
            // This event fires as soon as the player is ready
            // We set the playback speed and start playing if autoplay is on
            event.target.setPlaybackRate(playbackRate);
            if (autoplay) {
              event.target.playVideo();
            }
          },
          'onStateChange': (event) => {
            // This event fires when the player's state changes (playing, paused, ended, etc.)
            
            // Re-apply speed if player state changes (e.g., after buffering)
            if (event.data === window.YT.PlayerState.PLAYING) {
              event.target.setPlaybackRate(playbackRate);
            }
            
            // Handle autoplay for the next video
            if (event.data === window.YT.PlayerState.ENDED && autoplay) {
              const currentIndex = videos.findIndex(v => v.id === currentVideo);
              // Use modulo operator to wrap around to the first video
              const nextIndex = (currentIndex + 1) % videos.length;
              setCurrentVideo(videos[nextIndex].id);
            }
          },
        },
      });
    }

    // Cleanup function: This runs when the component unmounts
    // or when any dependency in the array changes (e.g., currentVideo changes)
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  // *** THE FIX is here: ***
  // We removed 'playbackRate' from this dependency array.
  // Now, changing the speed won't re-run this entire effect and restart the video.
  }, [currentVideo, autoplay, videos]); 

  // Helper function to get the playlist ID from a URL using regex
  function getPlaylistId(url) {
    const match = url.match(/[?&]list=([^#\&\?]+)/);
    return match ? match[1] : null;
  }

  // API call to get the playlist's title
  async function fetchPlaylistDetails(playlistId, apiKey) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`
    );
    const data = await res.json();
    if (!data.items || data.items.length === 0) return { title: "Unknown Playlist" };
    return { title: data.items[0].snippet.title };
  }

  // Helper function to parse YouTube's ISO 8601 duration string (e.g., "PT1M30S")
  // into a human-readable format (e.g., "1:30")
  function parseDuration(isoString) {
    const regex = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/;
    const matches = isoString.match(regex);
    
    if (!matches) return "0:00"; // Return default on no match

    // Parse hours, minutes, and seconds, defaulting to 0 if not present
    const hours = matches[1] ? parseInt(matches[1], 10) : 0;
    const minutes = matches[2] ? parseInt(matches[2], 10) : 0;
    const seconds = matches[3] ? parseInt(matches[3], 10) : 0;

    // Format seconds and minutes to always have two digits (e.g., "05")
    const s = String(seconds).padStart(2, '0');
    const m = String(minutes).padStart(2, '0');

    if (hours > 0) {
      return `${hours}:${m}:${s}`; // e.g., "1:05:30"
    } else {
      return `${minutes}:${s}`; // e.g., "05:30"
    }
  }

  // Fetches all videos in the playlist, including their durations
  async function fetchAllPlaylistVideos(playlistId, apiKey) {
    // 1. Fetch playlist items (titles, thumbnails, video IDs)
    let videoSnippets = [];
    let nextPageToken = "";

    // Loop to get all pages of playlist items (max 50 per page)
    do {
      const playlistResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&pageToken=${nextPageToken}&key=${apiKey}`
      );
      const playlistData = await playlistResponse.json();
      if (playlistData.error) throw new Error(playlistData.error.message); // Handle API errors
      if (!playlistData.items) break; // Exit loop if no items

      videoSnippets.push(
        ...playlistData.items
          .filter(item => item.snippet && item.contentDetails && item.snippet.thumbnails) // Ensure data is complete
          .map((item) => ({
            id: item.contentDetails.videoId,
            title: item.snippet.title,
            thumbnail:
              item.snippet.thumbnails?.medium?.url || // Prefer medium thumbnail
              item.snippet.thumbnails?.default?.url || // Fallback to default
              "https://placehold.co/160x90/000000/FFFFFF?text=No+Img", // Fallback image
          }))
      );
      nextPageToken = playlistData.nextPageToken || ""; // Get token for next page
    } while (nextPageToken);

    if (videoSnippets.length === 0) return []; // No videos found

    // 2. Batch-fetch video durations (requires a separate 'videos' API call)
    const allVideoIds = videoSnippets.map(v => v.id);
    const videoDetailsMap = new Map();
    
    // API allows max 50 IDs per 'videos' request, so we loop in batches
    for (let i = 0; i < allVideoIds.length; i += 50) {
      const batchIds = allVideoIds.slice(i, i + 50);
      const videoResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${batchIds.join(",")}&key=${apiKey}`
      );
      const videoData = await videoResponse.json();
      
      // Store durations in a Map for quick lookup
      if (videoData.items) {
        videoData.items.forEach(item => {
          videoDetailsMap.set(item.id, {
            duration: parseDuration(item.contentDetails.duration)
          });
        });
      }
    }

    // 3. Merge the two data sets (snippets + durations)
    return videoSnippets.map((snippet, index) => ({
      ...snippet,
      index: index + 1, // Add 1-based index for display
      duration: videoDetailsMap.get(snippet.id)?.duration || "0:00", // Get duration from map
    }));
  }

  // Main function called when "Load" button is clicked
  async function handleFetch() {
    const id = getPlaylistId(link);
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

    // Validate the playlist ID
    if (!id) {
      setError("Invalid playlist link. Make sure it includes '&list=...'");
      setVideos([]);
      setCurrentVideo(null);
      setPlaylistName("");
      return;
    }

    setLoading(true);
    setError("");
    try {
      // Fetch all videos and playlist title
      const vids = await fetchAllPlaylistVideos(id, apiKey);
      if (!vids || vids.length === 0) {
        setError("No videos found in this playlist.");
        setVideos([]);
        setCurrentVideo(null);
        setPlaylistName("Playlist");
        setLoading(false);
        return;
      }

      setVideos(vids);
      setCurrentVideo(vids[0].id); // Start playing the first video

      const details = await fetchPlaylistDetails(id, apiKey);
      setPlaylistName(details.title);
    } catch (err) {
      console.error(err);
      // Provide a more specific error for API key issues
      setError("Failed to fetch. Check API key, privacy settings, or if playlist is empty.");
      setVideos([]);
      setCurrentVideo(null);
      setPlaylistName("Playlist");
    } finally {
      setLoading(false);
    }
  }

  // Handler for the playback speed button
  function handleSpeedChange() {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackRate);
    // Cycle to the next speed, wrapping around to the start
    const nextIndex = (currentIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[nextIndex];
    setPlaybackRate(newSpeed);

    // This is the key: we directly command the *existing* player
    // to change its speed, without triggering the useEffect re-render.
    if (playerRef.current && playerRef.current.setPlaybackRate) {
      playerRef.current.setPlaybackRate(newSpeed);
    }
  }

  // JSX for rendering the component
  return (
    // Use min-h-screen to ensure background covers the whole page
    <div className="bg-gray-800 min-h-screen">
      {/* <Navbar /> */}
      <nav className="w-full justify-between h-[70px] bg-gray-900 text-white flex items-center px-6 shadow-md sticky top-0 z-50">
      <h1 className="text-2xl font-bold">Play-View</h1>
      {totalVideos > 0 && (
          <div className="w-[40%] mb-4">
            <div className="flex justify-between text-sm text-gray-300 mb-1">
              <span className="font-medium">Playlist Progress</span>
              <span className="font-medium">{currentVideoNumber} / {totalVideos} Videos</span>
            </div>
            {/* The outer div is the gray background of the bar */}
            <div className="w-full bg-gray-600 rounded-full h-2.5 shadow-inner">
              {/* The inner div is the colored progress, width is set by style */}
              <div 
                className="bg-indigo-400 h-2.5 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
          </div>
        )}
        {/* --- END NEW PROGRESS BAR SECTION --- */}
        
        {/* Input Section - Adjusted margins */}
        <div className="flex w-[50%] gap-2 mt-2 mb-4 flex-wrap">
          <input
            type="text"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="Paste playlist link..."
            className="flex-1 p-2 border-2 border-indigo-300 rounded bg-white text-black"
          />
          <button
            onClick={handleFetch}
            disabled={loading} // Disable button while loading
            className="bg-indigo-400 text-white px-8 py-2 rounded disabled:bg-gray-500"
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>
    </nav>
      {/* Main container with vertical flex, full height minus navbar */}
      {/* Adjusted padding-top from 50px to 30px */}
      <div className="play flex min-h-[calc(100vh-70px)] flex-col items-center pt-[30px] lg:h-[calc(100vh-70px)]">
        
        {/* --- NEW PROGRESS BAR SECTION --- */}
        {/* This section will only appear if there are videos loaded */}
        

        {/* Main Content Area: Video + Playlist */}
        <div className="main flex flex-col lg:flex-row gap-4 h-[90%] w-[90%] mx-auto pb-8 lg:pb-0">
          
          {/* Video Player Section */}
          <div className="video rounded-lg sm:h-full bg-black w-full lg:w-[90%] h-[40vh] lg:h-full">
            {/* This div is replaced by the YouTube IFrame Player */}
            <div id="youtube-player" className="w-full h-full aspect-video rounded-xl"></div>
          </div>

          {/* Playlist Sidebar Section */}
          <div className="playlist playlist-scroll rounded-lg lg:w-[35%] w-full bg-gray-700 flex flex-col h-[500px] lg:h-full">
            
            {/* Header Controls for Playlist */}
            <div className="info m-4 h-[50px] flex items-center justify-between px-4">
              {/* Playlist Title (truncated) */}
              <h2 className="text-xl text-white font-semibold line-clamp-1 max-w-[50%]">
                {playlistName || "Playlist"}
              </h2>

              {/* Controls container (Speed + Autoplay) */}
              <div className="flex items-center gap-3">
                
                {/* Speed Button */}
                <button
                  onClick={handleSpeedChange}
                  className="text-white bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded-md text-sm font-medium transition-colors w-14 text-center border border-gray-500"
                  title="Change Playback Speed"
                >
                  {playbackRate}x
                </button>

                {/* Autoplay Toggle */}
                <div
                  onClick={() => setAutoplay(!autoplay)}
                  className="flex items-center gap-2 px-2 py-1 rounded text-white cursor-pointer select-none" // select-none prevents text highlighting on click
                  title="Toggle Autoplay"
                >
                  <RotateCw
                    className={`w-5 h-5 transition-colors duration-300 ${
                      autoplay ? "text-indigo-400" : "text-gray-400"
                    }`}
                  />
                  {/* Toggle Switch UI */}
                  <div
                    className={`relative w-8 h-2 rounded-md togglearea transition-colors duration-300 ${
                      autoplay ? "bg-indigo-400" : "bg-gray-500"
                    }`}
                  >
                    <div
                      className={`circle absolute h-4 w-4 rounded-full top-[-50%] transition-all duration-300 ${
                        autoplay
                          ? "bg-indigo-500 left-[calc(100%-16px)]" // On state
                          : "bg-gray-200 left-0" // Off state
                      }`}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="text-red-400 px-4 py-2 text-center text-sm">{error}</div>
            )}

            {/* Loading Spinner */}
            {loading && (
              <div className="flex justify-center py-4">
                <div className="border-4 border-t-indigo-400 border-gray-200 rounded-full w-8 h-8 animate-spin"></div>
              </div>
            )}

            {/* Video List Items (Scrollable Area) */}
            <div className="list flex-1 overflow-y-auto px-2 py-2">
              {!loading && videos.map((v) => (
                <div
                  key={`${v.id}-${v.index}`} // Unique key for React
                  onClick={() => setCurrentVideo(v.id)}
                  // Dynamic classes for hover and active video
                  className={`flex px-2 py-2 mb-2 rounded-md items-center gap-x-3 cursor-pointer w-full transition-colors
                    hover:bg-gray-600 
                    ${currentVideo === v.id ? "bg-gray-600 border-l-4 border-indigo-400" : "bg-transparent"}`}
                >
                  {/* Video Number */}
                  <span className="text-gray-400 text-sm font-medium w-6 text-center flex-shrink-0">
                    {v.index}
                  </span>
                  
                  {/* Thumbnail Container */}
                  <div className="thumbnail relative w-[120px] sm:w-[140px] flex-shrink-0 aspect-video bg-gray-900 rounded-lg overflow-hidden group">
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="object-cover w-full h-full opacity-90 group-hover:opacity-100 transition-opacity"
                      // Fallback image in case thumbnail fails to load
                      onError={(e) => { e.target.src = 'https://placehold.co/160x90/000000/FFFFFF?text=No+Img'; }}
                    />
                    {/* Duration Badge */}
                    <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] font-bold px-1 rounded">
                      {v.duration}
                    </span>
                  </div>

                  {/* Video Title (truncated to 2 lines) */}
                  <p className="font-medium text-sm text-white line-clamp-2 leading-snug flex-1">
                    {v.title}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}