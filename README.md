# jellyfin-spicetify

WIP: A Spicetify extension to integrate your Jellyfin music library into Spotify

## Downloads

| Version        | Description                               | Links                                                                                                    |
| :------------- | :---------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| ~~**Stable**~~ | ~~Latest release~~ No stable releases yet | [Download](https://github.com/trafficlunar/jellyfin-spicetify/releases/latest)                           |
| **Unstable**   | Bleeding edge (latest commit)             | [Download](https://nightly.link/trafficlunar/jellyfin-spicetify/workflows/build/main/jellyfin-spicetify) |

## Features

- Stream music from Jellyfin instead of Spotify
- Play tracks that exist on Jellyfin but aren't available on Spotify

## Known Limitations

The following are current limitations with the extension. They are not impossible to implement, but are rather time-consuming or require fragile solutions.

### Non-Spotify tracks

Tracks that don't exist on Spotify can't be included in playlists, queue, etc. They can only be accessed via search and don't show up on the player interface.
