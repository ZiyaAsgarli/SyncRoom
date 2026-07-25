import { getDriveEnvironment } from "../config/drive";
import { fetchDriveFileMetadata, isValidDriveFileId, type DriveFileMetadata } from "./driveMetadata";

interface PickerDocument {
  id?: string;
  name?: string;
  mimeType?: string;
  resourceKey?: string;
}

interface PickerResponse {
  action?: string;
  docs?: PickerDocument[];
}

interface PickerView {
  setMimeTypes: (mimeTypes: string) => PickerView;
  setIncludeFolders: (include: boolean) => PickerView;
  setSelectFolderEnabled: (enabled: boolean) => PickerView;
}

interface PickerBuilder {
  addView: (view: PickerView) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
}

let pickerPromise: Promise<void> | null = null;

export async function pickDriveVideo(accessToken: string, expectedFileId?: string): Promise<DriveFileMetadata> {
  const env = getDriveEnvironment();
  if (!env.configured) throw new Error(`Drive is not configured: ${env.missing.join(", ")}`);
  await loadPickerApi();

  return new Promise((resolve, reject) => {
    const googleWithPicker = window.google as typeof window.google & {
      picker?: {
        Action: { PICKED: string; CANCEL: string };
        DocsView: new (...args: unknown[]) => PickerView;
        ViewId: { DOCS: string };
        PickerBuilder: new () => PickerBuilder;
      };
    };
    const pickerApi = googleWithPicker.picker;
    if (!pickerApi) {
      reject(new Error("Google Picker is unavailable."));
      return;
    }
    const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS);
    view.setMimeTypes("video/mp4,video/webm");
    view.setIncludeFolders(false);
    view.setSelectFolderEnabled(false);

    const picker = new pickerApi.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(env.pickerApiKey)
      .setAppId(env.appId)
      .setCallback((response) => {
        if (response.action === pickerApi.Action.CANCEL) {
          reject(new Error("Drive picker was closed."));
          return;
        }
        if (response.action !== pickerApi.Action.PICKED) return;
        const fileId = response.docs?.[0]?.id;
        if (!fileId || !isValidDriveFileId(fileId)) {
          reject(new Error("Picker returned an invalid Drive file."));
          return;
        }
        if (expectedFileId && fileId !== expectedFileId) {
          reject(new Error("Please select the exact Drive file chosen by the host."));
          return;
        }
        void fetchDriveFileMetadata(accessToken, fileId).then(resolve, reject);
      })
      .build();
    picker.setVisible(true);
  });
}

function loadPickerApi(): Promise<void> {
  if (window.google?.picker) return Promise.resolve();
  if (pickerPromise) return pickerPromise;
  pickerPromise = new Promise((resolve, reject) => {
    const load = () => {
      if (!window.gapi?.load) {
        reject(new Error("Google API loader is unavailable."));
        return;
      }
      window.gapi.load("picker", resolve);
    };

    if (window.gapi?.load) {
      load();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = load;
    script.onerror = () => reject(new Error("Google Picker API could not load."));
    document.head.appendChild(script);
  });
  return pickerPromise;
}
