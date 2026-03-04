import React from "react";
import { Api, Jellyfin } from "@jellyfin/sdk";
import { getSearchApi } from "@jellyfin/sdk/lib/utils/api/search-api";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";
import SettingsModal from "./settings";

let hijackActive = false;

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

async function main() {
	while (!Spicetify.showNotification) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	const audio = new Audio();

	// Topbar button for settings
	new Spicetify.Topbar.Button("Jellyfin", "podcasts", () => {
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

export default main;
