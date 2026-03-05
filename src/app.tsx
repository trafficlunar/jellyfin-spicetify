import React from "react";
import { Api, Jellyfin } from "@jellyfin/sdk";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api/user-api";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import SettingsModal from "./settings";

export const jellyfin = new Jellyfin({
	clientInfo: {
		name: "Spicetify",
		version: "1.0.0",
	},
	deviceInfo: {
		name: "Spotify",
		id: "spotify", // TODO: should be unique?
	},
});

export let jellyfinApi: Api | undefined;
export const setJellyfinApi = (api: Api) => {
	jellyfinApi = api;
};
export let jellyfinUser: string | undefined;
export const setJellyfinUser = (id: string) => {
	jellyfinUser = id;
};

let hijackActive = false;

async function main() {
	while (!Spicetify.showNotification) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	// Automatically login to Jellyfin if settings are present
	const url = Spicetify.LocalStorage.get("jellyfin-url");
	const token = Spicetify.LocalStorage.get("jellyfin-token");

	if (url && token) {
		const servers = await jellyfin.discovery.getRecommendedServerCandidates(url);
		const best = jellyfin.discovery.findBestServer(servers);
		if (!best) {
			Spicetify.showNotification("Failed to connect to Jellyfin server!", true);
			return;
		}
		jellyfinApi = jellyfin.createApi(best.address);
		jellyfinApi.accessToken = token;

		const user = await getUserApi(jellyfinApi).getCurrentUser();
		if (user.data.Id) setJellyfinUser(user.data.Id);
	}

	const audio = new Audio();
	const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12 .002C8.826.002-1.398 18.537.16 21.666c1.56 3.129 22.14 3.094 23.682 0S15.177 0 12 0zm7.76 18.949c-1.008 2.028-14.493 2.05-15.514 0C3.224 16.9 9.92 4.755 12.003 4.755c2.081 0 8.77 12.166 7.759 14.196zM12 9.198c-1.054 0-4.446 6.15-3.93 7.189c.518 1.04 7.348 1.027 7.86 0c.511-1.027-2.874-7.19-3.93-7.19z"/></svg>`;

	// Topbar button for settings
	new Spicetify.Topbar.Button("Jellyfin", icon, () => {
		Spicetify.PopupModal.display({
			title: "Jellyfin",
			content: React.createElement(SettingsModal) as unknown as Element,
			isLarge: false,
		});
	});

	// Search Jellyfin for song and play that instead if found
	Spicetify.Player.addEventListener("songchange", async (event) => {
		if (!jellyfinApi) return;
		if (!event) return;

		const results = await getSearchApi(jellyfinApi).getSearchHints({
			searchTerm: event.data.item.name,
			includeItemTypes: [BaseItemKind.Audio],
			limit: 1,
		});

		const item = results.data.SearchHints?.[0];
		if (!item?.Id) {
			const oldVolume = Spicetify.Player.getVolume();
			hijackActive = false;
			Spicetify.Platform.PlaybackAPI.setVolume(oldVolume);
			return;
		}

		Spicetify.showNotification("Playing on Jellyfin");

		const oldVolume = Spicetify.Player.getVolume();
		Spicetify.Platform.PlaybackAPI.setVolume(0); // Set Spotify audio volume to 0

		hijackActive = true;
		audio.src = `${jellyfinApi.basePath}/Audio/${item.Id}/universal?api_key=${jellyfinApi.accessToken}&UserId=${jellyfinUser}&Container=opus,webm|opus,mp3,aac,m4a|aac,m4a|alac,m4b|aac,flac,webma,webm|webma,wav,ogg&TranscodingContainer=ts&TranscodingProtocol=hls&AudioCodec=aac&MaxStreamingBitrate=140000000&EnableRedirection=true`;
		await audio.play();

		Spicetify.Platform.PlaybackAPI.setVolume(oldVolume); // Set Jellyfin audio volume to the actual volume
	});

	// Play/pause Jellyfin audio
	Spicetify.Player.addEventListener("onplaypause", async (event) => {
		if (!hijackActive) return;

		if (event?.data.isPaused) {
			audio.pause();
		} else {
			await audio.play();
		}
	});

	// Seeking support
	let oldTime = 0;
	Spicetify.Player.addEventListener("onprogress", async (event) => {
		if (!hijackActive) return;
		if (!event) return;

		// onprogress polls every 100ms, small time difference means normal playback
		const timeDiff = Math.abs(event.data - oldTime);
		if (Math.abs(timeDiff - 100) < 100) {
			// Allow 100ms tolerance
			oldTime = event.data;
			return;
		}

		audio.currentTime = event.data / 1000;
		oldTime = event.data;
	});

	// Change volume of Jellyfin audio instead of Spotify audio
	const playback = Spicetify.Platform.PlaybackAPI;
	playback.setVolume = new Proxy(playback.setVolume, {
		apply(target, thisArg, args) {
			if (hijackActive) {
				audio.volume = args[0];
				return;
			} else {
				return Reflect.apply(target, thisArg, args);
			}
		},
	});
}

main();
