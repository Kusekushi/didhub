import { Music, ExternalLink, Youtube } from 'lucide-react'

interface SoulSongPlayerProps {
  songs: string[] | undefined
}

interface ParsedSong {
  original: string
  youtubeId?: string
  spotifyId?: string
  spotifyType?: 'track' | 'album' | 'playlist'
}

// Extract YouTube video ID from various URL formats
function extractYoutubeId(text: string): string | undefined {
  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/ // Direct video ID
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

// Extract Spotify track/album/playlist ID from URLs
function extractSpotifyInfo(text: string): { id: string; type: 'track' | 'album' | 'playlist' } | undefined {
  // Match Spotify URLs
  const pattern = /(?:open\.spotify\.com|spotify\.com)\/(track|album|playlist)\/([a-zA-Z0-9]+)/
  const match = text.match(pattern)
  if (match) {
    return { type: match[1] as 'track' | 'album' | 'playlist', id: match[2] }
  }
  
  // Match Spotify URIs (spotify:track:xxx)
  const uriPattern = /spotify:(track|album|playlist):([a-zA-Z0-9]+)/
  const uriMatch = text.match(uriPattern)
  if (uriMatch) {
    return { type: uriMatch[1] as 'track' | 'album' | 'playlist', id: uriMatch[2] }
  }
  
  return undefined
}

function parseSong(song: string): ParsedSong {
  const result: ParsedSong = { original: song }
  
  // Try to extract YouTube ID
  result.youtubeId = extractYoutubeId(song)
  
  // Try to extract Spotify info
  const spotifyInfo = extractSpotifyInfo(song)
  if (spotifyInfo) {
    result.spotifyId = spotifyInfo.id
    result.spotifyType = spotifyInfo.type
  }
  
  return result
}

interface SongPlayerItemProps {
  song: ParsedSong
}

function SongPlayerItem({ song }: SongPlayerItemProps) {
  const hasPlayer = song.youtubeId || song.spotifyId
  
  return (
    <div className="space-y-2">
      {/* Song title/original text */}
      <div className="flex items-center gap-2 text-sm">
        <Music className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="break-all">{song.original}</span>
      </div>
      
      {/* YouTube Player */}
      {song.youtubeId && (
        <div className="relative w-full aspect-video max-w-sm rounded-lg overflow-hidden bg-black/5">
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${song.youtubeId}`}
            title={`YouTube: ${song.original}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}
      
      {/* Spotify Player */}
      {song.spotifyId && song.spotifyType && (
        <div className="w-full max-w-sm">
          <iframe
            className="rounded-lg"
            src={`https://open.spotify.com/embed/${song.spotifyType}/${song.spotifyId}?utm_source=generator&theme=0`}
            width="100%"
            height={song.spotifyType === 'track' ? 152 : 352}
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title={`Spotify: ${song.original}`}
          />
        </div>
      )}
      
      {/* Fallback: Search links for songs without recognized URLs */}
      {!hasPlayer && (
        <div className="flex gap-2 text-xs">
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(song.original)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 hover:underline"
          >
            <Youtube className="w-3 h-3" />
            Search YouTube
            <ExternalLink className="w-3 h-3" />
          </a>
          <a
            href={`https://open.spotify.com/search/${encodeURIComponent(song.original)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Search Spotify
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  )
}

export default function SoulSongPlayer({ songs }: SoulSongPlayerProps) {
  if (!songs || songs.length === 0) {
    return null
  }
  
  const parsedSongs = songs.map(parseSong)
  
  // Check if any song has an embeddable player
  const hasAnyPlayer = parsedSongs.some(s => s.youtubeId || s.spotifyId)
  
  return (
    <div className="space-y-4 mt-4 pt-4 border-t border-dashed">
      <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
        <Music className="w-4 h-4" />
        {hasAnyPlayer ? 'Now Playing' : 'Listen on'}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {parsedSongs.map((song, idx) => (
          <SongPlayerItem key={idx} song={song} />
        ))}
      </div>
    </div>
  )
}
