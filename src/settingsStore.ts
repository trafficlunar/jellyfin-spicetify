export interface Settings {
  hijack: boolean;
}

export let settings: Settings = {
  hijack: true,
};

export function setSettings(value: Settings) {
  settings = value;
}
