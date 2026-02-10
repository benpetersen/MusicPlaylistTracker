// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * One-time setup function to store your Spotify credentials securely
 * Run this once from the Google Apps Script editor, then you can delete it
 */
function setupSpotifyCredentials() {
  const props = PropertiesService.getScriptProperties();
  /**
  * ClientID and Secret are found https://developer.spotify.com/dashboard/applications
  * PlaylistID are found in open.spotify.com and click the playlist name which you own or have rights to edit. It should be 22 random characters
  */
  props.setProperties({
       'SPOTIFY_CLIENT_ID': '',
       'SPOTIFY_CLIENT_SECRET': '',
       'SPOTIFY_PLAYLIST_ID': ''
  });
  
  console.log('✅ Credentials saved securely!');
  console.log('You can now delete this function from your code.');
}
// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Gets Spotify credentials from Script Properties
 * Run setupSpotifyCredentials() once to set these up
 */
function getSpotifyCredentials() {
  const props = PropertiesService.getScriptProperties();
  
  return {
    clientId: props.getProperty('SPOTIFY_CLIENT_ID'),
    clientSecret: props.getProperty('SPOTIFY_CLIENT_SECRET'),
    playlistId: props.getProperty('SPOTIFY_PLAYLIST_ID')
  };
}

/**
 * Helper function to view stored credentials (for debugging)
 */
function viewStoredCredentials() {
  const creds = getSpotifyCredentials();
  console.log('Client ID:', creds.clientId ? 'Set' : 'Not set');
  console.log('Client Secret:', creds.clientSecret ? 'Set' : 'Not set');
  console.log('Playlist ID:', creds.playlistId ? 'Set' : 'Not set');
}

const CONFIG = {
  // Data Source
  githubJsonUrl: "https://raw.githubusercontent.com/benpetersen/MusicPlaylistTracker/refs/heads/main/93.3%20Recently%20Played%2012-20-2025.json",
  
  // JSON Processing
  columnDataStarts: 5,
  columnDataEnds: 7,
  trackPlayedMinimumTimes: 4,
  
  // Spotify API
  spotify: {
    // Credentials loaded from Script Properties (not hardcoded!)
    get clientId() { return getSpotifyCredentials().clientId; },
    get clientSecret() { return getSpotifyCredentials().clientSecret; },
    get playlistId() { return getSpotifyCredentials().playlistId; },
    
    // Other settings
    maxUrisPerRequest: 100,
    searchLimit: 15,
    baseUrl: "https://api.spotify.com",
    scopes: "user-library-read playlist-modify-public playlist-modify-private",
    preferCleanVersions: true, // Set to false to allow explicit tracks
    fallbackToExplicitIfNoClean: true, // If true, will add explicit version if no clean version exists
    skipLiveVersions: true, // Skip live recordings
    skipRemixes: true // Skip remixes
  }
};

// ============================================================================
// WEB APP UI FUNCTIONS
// ============================================================================

/**
 * Serves the HTML web app
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Spotify Playlist Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Saves the URL to properties for next time
 */
function saveUrl(url) {
  PropertiesService.getUserProperties().setProperty('LAST_JSON_URL', url);
  return true;
}

/**
 * Gets the last used URL
 */
function getLastUrl() {
  return PropertiesService.getUserProperties().getProperty('LAST_JSON_URL') || '';
}

/**
 * Processes the playlist from a URL - callable from UI
 */
function processPlaylistFromUrl(url, minPlayCount) {
  try {
    console.log("Fetching JSON from URL:", url);
    
    // Fetch the JSON data server-side
    const response = UrlFetchApp.fetch(url);
    const jsonText = response.getContentText();
    const jsonData = JSON.parse(jsonText);
    
    // Now process it
    return processPlaylist(jsonData, minPlayCount);
    
  } catch (error) {
    console.error("Error fetching from URL:", error);
    return {
      success: false,
      error: "Failed to fetch URL: " + error.toString()
    };
  }
}

/**
 * Processes the playlist - callable from UI
 */
function processPlaylist(jsonData, minPlayCount) {
  try {
    console.log("=== Starting Playlist Generation from UI ===");
    
    // Verify Spotify authorization
    if (!SpotifyAPI.isAuthorized()) {
      return {
        success: false,
        error: "Not authorized with Spotify. Please run authorization first.",
        authUrl: getSpotifyService_().getAuthorizationUrl()
      };
    }
    
    // Parse and validate JSON
    let parsedData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    
    // Handle nested iHeartRadio API response structure
    if (parsedData.data?.sites?.find?.stream?.amp?.currentlyPlaying?.tracks) {
      console.log("Detected nested iHeartRadio API response");
      parsedData = parsedData.data.sites.find.stream.amp.currentlyPlaying.tracks;
    }
    
    // Detect column positions dynamically
    const columnPositions = detectColumnPositions(parsedData);
    if (!columnPositions.success) {
      return {
        success: false,
        error: columnPositions.error
      };
    }
    
    // Update config based on format
    if (columnPositions.format === 'array') {
      CONFIG.columnDataStarts = columnPositions.songColumn;
      CONFIG.columnDataEnds = columnPositions.artistColumn + 1;
    }
    CONFIG.trackPlayedMinimumTimes = minPlayCount;
    
    // Process songs based on format
    let songs;
    if (columnPositions.format === 'object') {
      songs = extractSongDataFromObjects(parsedData);
    } else {
      songs = extractSongData(parsedData);
    }
    console.log(`Extracted ${songs.length} songs from JSON`);
    
    const songsWithCounts = aggregatePlayCounts(songs);
    const filteredSongs = songsWithCounts.filter(song => song.count > minPlayCount);
    console.log(`${filteredSongs.length} songs meet minimum play count of ${minPlayCount}`);
    
    // Match with Spotify
    const matchResults = matchSongsWithSpotify(filteredSongs);
    console.log(`Matched: ${matchResults.matched.length}, Unmatched: ${matchResults.unmatched.length}`);
    
    // Get current playlist
    const currentPlaylist = SpotifyAPI.getPlaylistTracks(CONFIG.spotify.playlistId);
    console.log(`Current playlist has ${currentPlaylist.length} tracks`);
    
    // Determine actions
    const playlistActions = determinePlaylistActions(matchResults, currentPlaylist);
    
    return {
      success: true,
      data: {
        totalSongs: songs.length,
        filteredCount: filteredSongs.length,
        minPlayCount: minPlayCount,
        unmatched: playlistActions.notMatchedAddManually.map(s => ({
          song: s.song,
          artist: s.artist,
          searchUrl: s.uri
        })),
        toAdd: playlistActions.addToPlaylist.map(s => ({
          song: s.song,
          artist: s.artist,
          uri: s.uri
        })),
        toRemove: playlistActions.removeFromPlaylist.map(s => ({
          song: s.song,
          artist: s.artist,
          uri: s.uri
        })),
        toKeep: playlistActions.keepInPlaylist.length
      }
    };
    
  } catch (error) {
    console.error("Error in processPlaylist:", error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Applies the changes to Spotify playlist
 */
function applyChangesToPlaylist(actions) {
  try {
    if (!SpotifyAPI.isAuthorized()) {
      return {
        success: false,
        error: "Not authorized with Spotify"
      };
    }
    
    const playlistId = CONFIG.spotify.playlistId;
    const maxUrisPerRequest = CONFIG.spotify.maxUrisPerRequest;
    
    let removedCount = 0;
    let addedCount = 0;
    
    // Remove tracks
    if (actions.toRemove && actions.toRemove.length > 0) {
      const uris = actions.toRemove.map(track => track.uri);
      SpotifyAPI.removeTracks(playlistId, uris);
      removedCount = uris.length;
    }
    
    // Add tracks
    if (actions.toAdd && actions.toAdd.length > 0) {
      const uris = actions.toAdd
        .map(track => track.uri)
        .filter(uri => uri.startsWith("spotify:"));
      
      for (let i = 0; i < uris.length; i += maxUrisPerRequest) {
        const batch = uris.slice(i, i + maxUrisPerRequest);
        const currentPlaylist = SpotifyAPI.getPlaylistTracks(playlistId);
        const position = Math.max(0, currentPlaylist.length);
        SpotifyAPI.addTracks(playlistId, batch, position);
      }
      addedCount = uris.length;
    }
    
    return {
      success: true,
      removedCount: removedCount,
      addedCount: addedCount
    };
    
  } catch (error) {
    console.error("Error applying changes:", error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Detects song and artist column positions dynamically
 * Handles both array format and object format
 */
function detectColumnPositions(data) {
  if (!data || data.length < 1) {
    return {
      success: false,
      error: "JSON data must have at least 1 row"
    };
  }
  
  const firstItem = data[0];
  
  // Check if this is object format (iHeartRadio API response)
  if (typeof firstItem === 'object' && !Array.isArray(firstItem)) {
    console.log("Detected iHeartRadio API object format");
    return {
      success: true,
      format: 'object',
      songField: 'title',
      artistField: 'artist.artistName',
      sampleSong: firstItem.title,
      sampleArtist: firstItem.artist?.artistName
    };
  }
  
  // Original array format
  if (data.length < 2) {
    return {
      success: false,
      error: "Array format requires at least 2 rows (header + data)"
    };
  }
  
  const firstDataRow = data[1];
  let songColumn = -1;
  let artistColumn = -1;
  
  // Look for columns that look like song titles and artist names
  for (let i = 0; i < firstDataRow.length; i++) {
    const value = String(firstDataRow[i]).toLowerCase();
    
    // Skip numeric-only columns (likely IDs)
    if (/^\d+$/.test(firstDataRow[i])) {
      continue;
    }
    
    // First non-numeric text column is likely the song
    if (songColumn === -1 && value.length > 2) {
      songColumn = i;
    }
    // Second non-numeric text column is likely the artist
    else if (artistColumn === -1 && value.length > 2) {
      artistColumn = i;
    }
    
    if (songColumn !== -1 && artistColumn !== -1) {
      break;
    }
  }
  
  if (songColumn === -1 || artistColumn === -1) {
    return {
      success: false,
      error: "Could not detect song and artist columns. Expected format: [..., song_name, artist_name, ...]"
    };
  }
  
  console.log(`Detected array format - Song: ${songColumn}, Artist: ${artistColumn}`);
  
  return {
    success: true,
    format: 'array',
    songColumn: songColumn,
    artistColumn: artistColumn,
    sampleSong: firstDataRow[songColumn],
    sampleArtist: firstDataRow[artistColumn]
  };
}

// ============================================================================
// SPOTIFY OAUTH2 SERVICE
// ============================================================================

/**
 * Creates and configures the Spotify OAuth2 service
 */
function getSpotifyService_() {
  const creds = getSpotifyCredentials();
  
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error('Spotify credentials not configured. Please run setupSpotifyCredentials() first.');
  }
  
  return OAuth2.createService('Spotify')
    .setAuthorizationBaseUrl('https://accounts.spotify.com/authorize')
    .setTokenUrl('https://accounts.spotify.com/api/token')
    .setClientId(creds.clientId)
    .setClientSecret(creds.clientSecret)
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope(CONFIG.spotify.scopes);
}

/**
 * Resets OAuth authorization
 */
function resetAuth() {
  getSpotifyService_().reset();
}

/**
 * OAuth callback handler
 */
function authCallback(request) {
  const spotifyService = getSpotifyService_();
  const isAuthorized = spotifyService.handleCallback(request);
  
  return HtmlService.createHtmlOutput(
    isAuthorized 
      ? 'Success! You can close this tab.' 
      : 'Denied. You can close this tab'
  );
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

function GenerateJSON() {
  try {
    console.log("=== Starting Playlist Generation ===");
    
    // Verify Spotify authorization
    if (!SpotifyAPI.isAuthorized()) {
      console.error("Not authorized. Please authorize first.");
      return;
    }
    
    // Step 1: Load and filter song data from JSON
    const songs = loadAndFilterSongs();
    console.log(`Loaded ${songs.length} songs meeting minimum play threshold`);
    
    // Step 2: Match songs with Spotify tracks
    const matchResults = matchSongsWithSpotify(songs);
    console.log(`Matched: ${matchResults.matched.length}, Unmatched: ${matchResults.unmatched.length}`);
    
    // Step 3: Get current playlist state
    const currentPlaylist = SpotifyAPI.getPlaylistTracks(CONFIG.spotify.playlistId);
    console.log(`Current playlist has ${currentPlaylist.length} tracks`);
    
    // Step 4: Determine what changes to make
    const playlistActions = determinePlaylistActions(matchResults, currentPlaylist);
    logPlaylistActions(playlistActions);
    
    // Step 5: Apply changes to Spotify
    applyPlaylistChanges(playlistActions);
    
    // Step 6: Report unmatched songs
    if (playlistActions.notMatchedAddManually.length > 0) {
      console.log("\n=== Songs requiring manual addition ===");
      playlistActions.notMatchedAddManually.forEach(song => {
        console.log(`"${song.song}" by ${song.artist}`);
      });
    }
    
    console.log("\n=== Playlist Generation Complete ===");
    
  } catch (error) {
    console.error("Error in GenerateJSON:", error);
    throw error;
  }
}

// ============================================================================
// DATA LOADING & PROCESSING
// ============================================================================

/**
 * Loads song data from JSON and filters by minimum play count
 */
function loadAndFilterSongs() {
  const rawData = ImportJSON(CONFIG.githubJsonUrl, "", "");
  const songs = extractSongData(rawData);
  const songsWithCounts = aggregatePlayCounts(songs);
  
  return songsWithCounts.filter(song => 
    song.count > CONFIG.trackPlayedMinimumTimes
  );
}

/**
 * Extracts song and artist data from raw JSON (array format)
 */
function extractSongData(rawData) {
  const songs = [];
  
  for (let i = 1; i < rawData.length; i++) {
    const song = rawData[i][CONFIG.columnDataStarts]?.replace(/'/g, "") || "";
    const artist = rawData[i][CONFIG.columnDataEnds - 1]?.replace(/'/g, "") || "";
    
    if (song && artist) {
      songs.push({ song, artist });
    }
  }
  
  return songs;
}

/**
 * Extracts song and artist data from iHeartRadio API object format
 */
function extractSongDataFromObjects(rawData) {
  const songs = [];
  
  for (const item of rawData) {
    const song = item.title?.replace(/'/g, "") || "";
    const artist = item.artist?.artistName?.replace(/'/g, "") || "";
    
    if (song && artist) {
      songs.push({ song, artist });
    }
  }
  
  return songs;
}

/**
 * Counts occurrences of each song
 */
function aggregatePlayCounts(songs) {
  const countMap = new Map();
  
  for (const song of songs) {
    const key = `${song.song}|${song.artist}`;
    
    if (!countMap.has(key)) {
      countMap.set(key, { ...song, count: 1 });
    } else {
      countMap.get(key).count++;
    }
  }
  
  return Array.from(countMap.values());
}

// ============================================================================
// SPOTIFY MATCHING
// ============================================================================

/**
 * Matches songs with Spotify tracks using search API
 */
function matchSongsWithSpotify(songs) {
  const results = songs.map(song => 
    matchSingleSong(song.song, song.artist)
  );
  
  const matched = results.filter(r => r.success);
  const unmatched = results.filter(r => !r.success);
  
  // Try broader search for unmatched songs
  if (unmatched.length > 0) {
    console.log(`Retrying ${unmatched.length} unmatched songs with broader search`);
    const retryResults = retryUnmatchedSongs(unmatched);
    
    return {
      matched: [...matched, ...retryResults.matched],
      unmatched: retryResults.unmatched
    };
  }
  
  return { matched, unmatched };
}

/**
 * Attempts to match a single song with Spotify
 */
function matchSingleSong(song, artist, useBroaderSearch = false) {
  let searchResults = useBroaderSearch
    ? SpotifyAPI.searchTrackBroad(song, artist)
    : SpotifyAPI.searchTrackStrict(song, artist);
  
  let bestMatch = findBestMatch(searchResults, song, artist);
  
  // If no match and artist contains "&" or "and", try searching with just the first artist
  if (!bestMatch.success && (artist.includes('&') || artist.toLowerCase().includes(' and '))) {
    console.log(`Retrying "${song}" with primary artist only`);
    
    // Extract first artist (before & or "and")
    const primaryArtist = artist.split(/&| and /i)[0].trim();
    
    searchResults = useBroaderSearch
      ? SpotifyAPI.searchTrackBroad(song, primaryArtist)
      : SpotifyAPI.searchTrackStrict(song, primaryArtist);
    
    bestMatch = findBestMatch(searchResults, song, artist, true); // Pass true to use flexible artist matching
  }
  
  return bestMatch;
}

/**
 * Retries unmatched songs with broader search parameters
 */
function retryUnmatchedSongs(unmatchedSongs) {
  const results = unmatchedSongs.map(({ song, artist }) =>
    matchSingleSong(song, artist, true)
  );
  
  return {
    matched: results.filter(r => r.success),
    unmatched: results.filter(r => !r.success)
  };
}

/**
 * Finds the best matching track from Spotify search results
 * Prefers clean versions when CONFIG.spotify.preferCleanVersions is true
 * Filters out live versions and remixes based on config
 * @param {Object} searchResults - Spotify search results
 * @param {string} targetSong - Original song name
 * @param {string} targetArtist - Original artist name (may contain & or "and")
 * @param {boolean} flexibleArtistMatch - If true, matches if ANY listed artist matches
 */
function findBestMatch(searchResults, targetSong, targetArtist, flexibleArtistMatch = false) {
  if (!searchResults?.items?.length) {
    return createMatchResult(targetSong, targetArtist, null, false);
  }
  
  const items = searchResults.items;
  const normalizedTargetSong = normalizeString(targetSong);
  
  // Split multiple artists for flexible matching
  const targetArtists = targetArtist.split(/&| and |,/i).map(a => normalizeString(a.trim()));
  
  const matches = [];
  
  // Find all matching tracks
  for (const item of items) {
    const trackName = normalizeString(item.name);
    const originalTrackName = item.name.toLowerCase();
    
    // Check if song name matches
    if (!trackName.includes(normalizedTargetSong)) {
      continue;
    }
    
    // Filter out live versions if configured
    if (CONFIG.spotify.skipLiveVersions) {
      const lowerTrackName = originalTrackName.toLowerCase();
      if (lowerTrackName.includes('live') || 
          lowerTrackName.includes('acoustic') ||
          lowerTrackName.match(/\blive at\b/i)) {
        console.log(`Skipping live version: "${item.name}"`);
        continue;
      }
    }
    
    // Filter out remixes if configured
    if (CONFIG.spotify.skipRemixes) {
      const lowerTrackName = originalTrackName.toLowerCase();
      if (lowerTrackName.includes('remix') ||
          lowerTrackName.includes('mix') ||
          lowerTrackName.includes('edit') ||
          lowerTrackName.includes('radio edit') ||
          lowerTrackName.includes('extended')) {
        console.log(`Skipping remix/edit: "${item.name}"`);
        continue;
      }
    }
    
    // Check artist matching
    let artistMatches = false;
    
    for (const artist of item.artists) {
      const artistName = normalizeString(artist.name);
      
      if (flexibleArtistMatch) {
        // Match if ANY of the target artists appear in ANY of the track's artists
        for (const targetArt of targetArtists) {
          if (artistName.includes(targetArt) || targetArt.includes(artistName)) {
            artistMatches = true;
            break;
          }
        }
      } else {
        // Original strict matching - all parts must be present
        let allPartsMatch = true;
        for (const targetArt of targetArtists) {
          let foundPart = false;
          for (const trackArtist of item.artists) {
            const trackArtistName = normalizeString(trackArtist.name);
            if (trackArtistName.includes(targetArt) || targetArt.includes(trackArtistName)) {
              foundPart = true;
              break;
            }
          }
          if (!foundPart) {
            allPartsMatch = false;
            break;
          }
        }
        artistMatches = allPartsMatch;
      }
      
      if (artistMatches) {
        break;
      }
    }
    
    if (artistMatches) {
      matches.push(item);
    }
  }
  
  // No matches found
  if (matches.length === 0) {
    console.log(`No match found for: "${targetSong}" by "${targetArtist}"`);
    return createMatchResult(
      targetSong, 
      targetArtist, 
      { href: searchResults.href },
      false
    );
  }
  
  // If we don't care about clean versions, return first match
  if (!CONFIG.spotify.preferCleanVersions) {
    return createMatchResult(targetSong, targetArtist, matches[0], true);
  }
  
  // Try to find clean version
  const cleanVersion = matches.find(track => !track.explicit);
  
  if (cleanVersion) {
    console.log(`Found clean version: "${targetSong}" by "${targetArtist}"`);
    return createMatchResult(targetSong, targetArtist, cleanVersion, true);
  }
  
  // No clean version found
  if (CONFIG.spotify.fallbackToExplicitIfNoClean) {
    console.log(`No clean version found for "${targetSong}" by "${targetArtist}", using explicit version`);
    return createMatchResult(targetSong, targetArtist, matches[0], true);
  } else {
    console.log(`No clean version found for "${targetSong}" by "${targetArtist}", skipping`);
    return createMatchResult(
      targetSong, 
      targetArtist, 
      { href: searchResults.href, reason: "explicit_only" },
      false
    );
  }
}

/**
 * Creates a standardized match result object
 */
function createMatchResult(song, artist, spotifyTrack, success) {
  return {
    song,
    artist,
    trackId: success ? spotifyTrack.id : "",
    uri: success ? spotifyTrack.uri : (spotifyTrack?.href || ""),
    success
  };
}

/**
 * Normalizes strings for comparison (lowercase, remove special chars)
 */
function normalizeString(str) {
  return str
    .toLowerCase()
    .replace(/['\-_]/g, "")
    .trim();
}

// ============================================================================
// PLAYLIST COMPARISON & ACTIONS
// ============================================================================

/**
 * Determines what actions to take on the playlist
 */
function determinePlaylistActions(matchResults, currentPlaylist) {
  const actions = {
    notMatchedAddManually: [...matchResults.unmatched],
    addToPlaylist: [],
    removeFromPlaylist: [],
    keepInPlaylist: []
  };
  
  // Create lookup maps for efficient comparison
  const matchedSongsMap = createSongMap(matchResults.matched);
  const playlistSongsMap = createPlaylistMap(currentPlaylist);
  
  // Determine which matched songs to add or keep
  for (const matchedSong of matchResults.matched) {
    const normalizedTitle = normalizeString(matchedSong.song);
    
    if (playlistSongsMap.has(normalizedTitle)) {
      actions.keepInPlaylist.push(matchedSong);
    } else {
      actions.addToPlaylist.push(matchedSong);
    }
  }
  
  // Determine which playlist songs to remove
  for (const playlistTrack of currentPlaylist) {
    const normalizedTitle = normalizeString(playlistTrack.track.name);
    
    if (!matchedSongsMap.has(normalizedTitle)) {
      actions.removeFromPlaylist.push({
        song: playlistTrack.track.name,
        artist: playlistTrack.track.artists[0].name,
        uri: playlistTrack.track.uri,
        success: true
      });
    }
  }
  
  return actions;
}

/**
 * Creates a map of matched songs for quick lookup
 */
function createSongMap(matchedSongs) {
  const map = new Map();
  
  for (const song of matchedSongs) {
    const normalizedTitle = normalizeString(song.song);
    map.set(normalizedTitle, song);
  }
  
  return map;
}

/**
 * Creates a map of playlist tracks for quick lookup
 */
function createPlaylistMap(playlistTracks) {
  const map = new Map();
  
  for (const item of playlistTracks) {
    const normalizedTitle = normalizeString(item.track.name);
    map.set(normalizedTitle, item);
  }
  
  return map;
}

/**
 * Logs playlist action summary
 */
function logPlaylistActions(actions) {
  console.log("\n=== Playlist Actions Summary ===");
  console.log(`Keep in playlist: ${actions.keepInPlaylist.length}`);
  console.log(`Add to playlist: ${actions.addToPlaylist.length}`);
  console.log(`Remove from playlist: ${actions.removeFromPlaylist.length}`);
  console.log(`Couldn't match (manual add needed): ${actions.notMatchedAddManually.length}`);
}

// ============================================================================
// SPOTIFY API OPERATIONS
// ============================================================================

/**
 * Applies all playlist changes to Spotify
 */
function applyPlaylistChanges(actions) {
  const { addToPlaylist, removeFromPlaylist } = actions;
  const { playlistId, maxUrisPerRequest } = CONFIG.spotify;
  
  // Remove tracks first
  if (removeFromPlaylist.length > 0) {
    console.log(`\nRemoving ${removeFromPlaylist.length} tracks...`);
    const uris = removeFromPlaylist.map(track => track.uri);
    SpotifyAPI.removeTracks(playlistId, uris);
    console.log("Tracks removed successfully");
  }
  
  // Add new tracks in batches
  if (addToPlaylist.length > 0) {
    console.log(`\nAdding ${addToPlaylist.length} tracks...`);
    const uris = addToPlaylist
      .map(track => track.uri)
      .filter(uri => uri.startsWith("spotify:"));
    
    // Process in batches
    for (let i = 0; i < uris.length; i += maxUrisPerRequest) {
      const batch = uris.slice(i, i + maxUrisPerRequest);
      const batchNum = Math.floor(i / maxUrisPerRequest) + 1;
      const totalBatches = Math.ceil(uris.length / maxUrisPerRequest);
      
      console.log(`Adding batch ${batchNum}/${totalBatches} (${batch.length} tracks)`);
      
      // Get current playlist length for positioning
      const currentPlaylist = SpotifyAPI.getPlaylistTracks(playlistId);
      const position = Math.max(0, currentPlaylist.length);
      
      SpotifyAPI.addTracks(playlistId, batch, position);
    }
    
    console.log("All tracks added successfully");
  }
  
  if (removeFromPlaylist.length === 0 && addToPlaylist.length === 0) {
    console.log("\nNo changes needed - playlist is up to date!");
  }
}

// ============================================================================
// SPOTIFY API WRAPPER
// ============================================================================

const SpotifyAPI = {
  /**
   * Checks if user is authorized
   */
  isAuthorized() {
    const service = getSpotifyService_();
    if (!service.hasAccess()) {
      console.log("App has no access yet.");
      console.log("Open the following URL and re-run the script:");
      console.log(service.getAuthorizationUrl());
      return false;
    }
    return true;
  },

  /**
   * Makes an authenticated request to Spotify API
   */
  _makeRequest(endpoint, options = {}) {
    const service = getSpotifyService_();
    
    if (!service.hasAccess()) {
      throw new Error("Not authorized. Please run isAuthorized() first.");
    }
    
    const defaultOptions = {
      headers: {
        "Authorization": `Bearer ${service.getAccessToken()}`
      },
      muteHttpExceptions: true
    };
    
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };
    
    try {
      const url = `${CONFIG.spotify.baseUrl}${endpoint}`;
      const response = UrlFetchApp.fetch(url, mergedOptions);
      const responseCode = response.getResponseCode();
      
      if (responseCode !== 200 && responseCode !== 201) {
        console.error(`API Error ${responseCode}:`, response.getContentText());
        throw new Error(`Spotify API returned ${responseCode}`);
      }
      
      return JSON.parse(response.getContentText());
      
    } catch (e) {
      console.error("Error making Spotify API request:", e);
      throw e;
    }
  },

  /**
   * Searches for a track with strict matching (query format)
   * Optionally filters for clean versions
   */
  searchTrackStrict(songName, artistName) {
    // Clean and encode search terms
    const cleanSong = songName.replace(/&/g, "").replace(/ /g, "+");
    const cleanArtist = artistName.replace(/&/g, "").replace(/ /g, "+");
    
    // Increase limit if we're filtering for clean versions to have more options
    const limit = CONFIG.spotify.preferCleanVersions ? 30 : CONFIG.spotify.searchLimit;
    
    const endpoint = `/v1/search?query=${cleanSong}%26artist%3A${cleanArtist}&type=track&market=US&locale=en-US&limit=${limit}`;
    
    const result = this._makeRequest(endpoint);
    return result.tracks;
  },

  /**
   * Searches for a track with broad matching (name:song artist:artist format)
   * Optionally filters for clean versions
   */
  searchTrackBroad(songName, artistName) {
    // Clean and encode search terms
    const cleanSong = songName.replace(/&/g, "").replace(/ /g, "+");
    const cleanArtist = artistName.replace(/&/g, "").replace(/ /g, "+");
    
    // Increase limit if we're filtering for clean versions to have more options
    const limit = CONFIG.spotify.preferCleanVersions ? 30 : CONFIG.spotify.searchLimit;
    
    const endpoint = `/v1/search?q=name:${cleanSong}%26artist%3A${cleanArtist}&type=track&market=US&locale=en-US&limit=${limit}`;
    
    const result = this._makeRequest(endpoint);
    return result.tracks;
  },

  /**
   * Gets all tracks from a playlist
   */
  getPlaylistTracks(playlistId) {
    const limit = 100;
    let offset = 0;
    let allTracks = [];
    
    const endpoint = `/v1/playlists/${playlistId}/tracks?fields=items(track(name,artists,uri)),snapshot_id&limit=${limit}`;
    
    // Paginate through all tracks
    while (true) {
      const offsetParam = offset > 0 ? `&offset=${offset}` : "";
      const result = this._makeRequest(endpoint + offsetParam);
      
      if (!result.items || result.items.length === 0) {
        break;
      }
      
      // Filter out null tracks (can happen with local files or removed tracks)
      const validTracks = result.items.filter(item => item.track != null);
      allTracks = allTracks.concat(validTracks);
      
      // Store snapshot_id on first iteration
      if (offset === 0 && result.snapshot_id) {
        allTracks.snapshot_id = result.snapshot_id;
      }
      
      offset += limit;
      
      if (result.items.length < limit) {
        break;
      }
    }
    
    return allTracks;
  },

  /**
   * Adds tracks to a playlist at a specific position
   */
  addTracks(playlistId, uris, position = 0) {
    if (!uris || uris.length === 0) {
      console.log("No tracks to add");
      return;
    }
    
    const endpoint = `/v1/playlists/${playlistId}/tracks?position=${position}`;
    const payload = { uris };
    
    return this._makeRequest(endpoint, {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
  },

  /**
   * Removes tracks from a playlist (handles batching automatically)
   */
  removeTracks(playlistId, uris) {
    if (!uris || uris.length === 0) {
      console.log("No tracks to remove");
      return;
    }
    
    const maxTracksPerDelete = 100; // Spotify API limit
    const results = [];
    
    // Process in batches of 100
    for (let i = 0; i < uris.length; i += maxTracksPerDelete) {
      const batch = uris.slice(i, i + maxTracksPerDelete);
      const batchNum = Math.floor(i / maxTracksPerDelete) + 1;
      const totalBatches = Math.ceil(uris.length / maxTracksPerDelete);
      
      console.log(`Removing batch ${batchNum}/${totalBatches} (${batch.length} tracks)`);
      
      // Get current snapshot ID (may change between batches)
      const playlistData = this.getPlaylistTracks(playlistId);
      const snapshotId = playlistData.snapshot_id;
      
      // Format URIs for delete request
      const tracks = batch.map(uri => ({ uri }));
      
      const endpoint = `/v1/playlists/${playlistId}/tracks`;
      const payload = {
        tracks,
        snapshot_id: snapshotId
      };
      
      const result = this._makeRequest(endpoint, {
        method: "DELETE",
        contentType: "application/json",
        payload: JSON.stringify(payload)
      });
      
      results.push(result);
    }
    
    return results.length === 1 ? results[0] : results;
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Deep clone an object (useful for debugging)
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Retry a function with exponential backoff
 */
function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = baseDelay * Math.pow(2, i);
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      Utilities.sleep(delay);
    }
  }
}
