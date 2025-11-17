'use client'
import "@/components/Navbar"
import { useState, useEffect, useRef } from "react";
import Navbar from "@/components/Navbar";
import { RotateCw } from "lucide-react";

export default function Home() {
  const [autoplay, setAutoplay] = useState(true);
  const [playlistName, setPlaylistName] = useState("");
  const [videos, setVideos] = useState([]);
  const [link, setLink] = useState("");
  const [currentVideo, setCurrentVideo] = useState(null);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  }, []);

  const playerRef = useRef(null);

  useEffect(() => {
    if (window.YT && window.YT.Player && currentVideo) {
      playerRef.current = new window.YT.Player("youtube-player", {
        videoId: currentVideo,
        playerVars: {
          autoplay: autoplay ? 1 : 0,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED && autoplay) {
              const currentIndex = videos.findIndex(v => v.id === currentVideo);
              const nextIndex = (currentIndex + 1) % videos.length;
              setCurrentVideo(videos[nextIndex].id);
            }
          },
        },
      });
    }

    // Cleanup old player
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [currentVideo, autoplay]);


  function getPlaylistId(url) {
    const match = url.match(/[?&]list=([^#\&\?]+)/);
    return match ? match[1] : null;
  }
  async function fetchPlaylistDetails(playlistId, apiKey) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${apiKey}`
    );
    const data = await res.json();
    if (!data.items || data.items.length === 0) return { title: "Unknown Playlist" };
    return { title: data.items[0].snippet.title };
  }

  async function handleFetch() {
    const id = getPlaylistId(link);
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
    const vids = await fetchPlaylistVideos(id, apiKey);
    setVideos(vids);
    setCurrentVideo(vids[0].id);
    const details = await fetchPlaylistDetails(id, apiKey);
    setPlaylistName(details.title);
  }

  async function fetchPlaylistVideos(playlistId, apiKey) {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}`
    );
    const data = await response.json();
    return data.items
      .filter(item => item.snippet && item.contentDetails) // filter out invalid items
      .map(item => ({
        id: item.contentDetails.videoId,
        title: item.snippet.title,
        thumbnail:
          item.snippet.thumbnails?.medium?.url || // first choice
          item.snippet.thumbnails?.default?.url || // fallback
          "/fallback-thumbnail.png",              // optional local fallback
      }));
  }

  return (
    <div>
      <div className="absolute inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]"></div>
      <Navbar />
      <div className="play h-[calc(100vh-70px)] pt-[50px] flex flex-col items-center">
        <div className="flex w-[90%] gap-2 my-4 flex-wrap">
              <input
                type="text"
                value={link}
                onChange={e => setLink(e.target.value)}
                placeholder="Paste playlist link..."
                className="flex-1 p-2 w-[80%] border-2 border-indigo-300 rounded bg-white"
              />
              <button onClick={handleFetch} className="bg-indigo-400 text-white px-8 py-2 rounded ">
                Load
              </button>
            </div>
        <div className="main flex gap-4 h-[80%] w-[90%] mx-auto">
          <div className="video flex-2 rounded-lg flex items-center bg-black h-full">
            <div className="w-full h-full">
              <div id="youtube-player" className="w-full h-full aspect-video rounded-xl"></div>
            </div>
          </div>
          <div className="playlist flex-1 overflow-hidden rounded-lg playlist-scroll max-w-[500px] bg-gray-700 h-full">
            
            <div className="info mt-[8%] h-[50px] flex items-center justify-between">
              <h2 className="text-xl text-white font-semibold p-4">
                {playlistName ? playlistName : "Playlist"}
              </h2>

              <div
                onClick={() => setAutoplay(!autoplay)}
                className="flex items-center gap-2 px-3 py-1 rounded text-white"
              >
                <RotateCw
                  className={`w-5 h-5 transition-colors duration-300 ${autoplay ? "text-indigo-400" : "text-gray-400"
                    }`}
                />
                <div
                  className={`relative w-8 h-2 rounded-md togglearea transition-colors duration-300 ${autoplay ? "bg-indigo-400" : "bg-gray-500"
                    }`}
                >
                  <div
                    className={`circle absolute h-4 w-4 rounded-full top-[-50%] transition-all duration-300 ${autoplay ? "bg-indigo-500 left-[calc(100%-16px)]" : "bg-gray-200 left-0"
                      }`}
                  ></div>
                </div>
              </div>
            </div>
            <div className="list">
              <div className="flex flex-col overflow-y-auto h-[520px]">
                {videos.map(v => (
                  <div
                    key={v.id}
                    onClick={() => setCurrentVideo(v.id)}
                    className={`flex px-2 py-2 rounded-md items-center gap-x-2 cursor-pointer w-full 
    hover:bg-gray-500 
    ${currentVideo === v.id ? "bg-gray-600" : ""}`}
                  >
                    <div className="thumbnail aspect-video w-[50%] flex-shrink-0 max-w-[200px]">
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        className="rounded-lg object-cover h-full w-full"
                      />
                    </div>
                    <p className="mt-0 font-medium text-sm sm:text-base md:text-[1 rem] lg:text-lg self-start text-white line-clamp-3 w-[70%]">
                      {v.title}
                    </p>
                  </div>
                ))}

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
