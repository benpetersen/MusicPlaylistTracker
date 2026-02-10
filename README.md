# Spotify Playlist Generator

A smart playlist generation tool that analyzes radio station play data to automatically create Spotify playlists based on song popularity trends.

## Overview

This application monitors radio station airplay and generates curated Spotify playlists by adding trending songs (5+ plays over a 2-week period) to a playlist. The tool intelligently matches songs to their Spotify counterparts while preferring clean versions and handling API rate limits.

## Features

- **Intelligent Song Matching**: Analyzes radio play data to identify trending tracks
- **Smart Track Selection**: Automatically prefers non-explicit versions when available
- **Multi-API Integration**: Leverages Spotify's playlist lookup and search APIs
- **Rate Limit Handling**: Built-in throttling and retry logic for reliable API interactions
- **Flexible Input Options**: Supports both URL and JSON input formats
- **Custom UI**: User-friendly interface for easy playlist generation

## Technologies Used

- **JavaScript**: Core application logic
- **REST APIs**: Spotify Web API integration
- **GraphQL**: Advanced data querying capabilities
- **Spotify Web API**: Playlist creation and track search

## How It Works

1. **Data Collection**: Ingests radio station play data via URL or JSON input
2. **Trend Analysis**: Identifies songs with 5+ plays over a 2-week window
3. **Song Matching**: Searches Spotify's catalog for matching tracks
4. **Version Selection**: Prioritizes non-explicit versions when available
5. **Playlist Creation**: Generates a curated Spotify playlist with matched songs

## Setup

### Prerequisites

- Node.js (version X.X or higher)
- Spotify Developer Account
- Spotify API credentials (Client ID and Client Secret)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/spotify-playlist-generator.git

# Navigate to project directory
cd spotify-playlist-generator

# Install dependencies
npm install
```

### Configuration

1. Create a `.env` file in the root directory
2. Add your Spotify API credentials:

```
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
SPOTIFY_REDIRECT_URI=your_redirect_uri_here
```

## Usage

### Input Format

The application accepts radio play data in two formats:

**URL Input:**
```
Provide a direct URL to your radio play data source
```

**JSON Input:**
```json
{
  "plays": [
    {
      "artist": "Artist Name",
      "title": "Song Title",
      "playCount": 7,
      "dateRange": "2024-01-01 to 2024-01-14"
    }
  ]
}
```
**Usage Guidelines:**
**Important**: The URL input feature is designed for one-time data uploads. 
Please do not:
- Set up automated scripts to ping URLs repeatedly
- Use this tool to scrape data continuously from external sources
- Exceed reasonable usage that could burden external servers

Respectful use helps keep this tool available for everyone.

### Running the Application

```bash
npm start
```

Then navigate to `http://localhost:3000` in your browser.

## API Rate Limiting

The application implements intelligent rate limit handling to ensure reliable operation:

- Automatic retry logic with exponential backoff
- Request throttling to stay within Spotify's API limits
- Graceful error handling and user notifications

## Future Enhancements

- [ ] Support for multiple radio stations
- [ ] Customizable play count thresholds
- [ ] Historical playlist versioning
- [ ] Integration with additional music platforms
- [ ] Advanced filtering options (genre, era, etc.)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[Your chosen license - e.g., MIT, Apache 2.0]

## Contact

[Your Name] - [Your Email or LinkedIn]

Project Link: [https://github.com/yourusername/spotify-playlist-generator](https://github.com/yourusername/spotify-playlist-generator)

## Acknowledgments

- Spotify Web API for providing comprehensive music data access
- [Any other libraries or resources you used]
