/**
 * With the `drive.file` scope the app cannot open a file someone else created
 * until the user explicitly picks it. The Google Picker, pre-targeted at the
 * invited file, is that one explicit grant.
 */
declare global {
  interface Window {
    gapi?: { load(name: string, cb: () => void): void };
  }
}

let loading: Promise<void> | null = null;
function loadPicker(): Promise<void> {
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => window.gapi!.load('picker', resolve);
    s.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google Picker'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const pickerConfig = {
  apiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
  appId: import.meta.env.VITE_GOOGLE_APP_ID || '',
};

export function pickerAvailable(): boolean {
  return !!pickerConfig.apiKey && !!pickerConfig.appId;
}

/** Resolves true once the user has picked the file, false if they cancelled. */
export async function grantFileAccess(fileId: string, token: string): Promise<boolean> {
  await loadPicker();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const picker = (window as any).google.picker;
  return new Promise<boolean>((resolve) => {
    const view = new picker.DocsView().setFileIds(fileId).setMode(picker.DocsViewMode.LIST);
    new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(pickerConfig.apiKey)
      .setAppId(pickerConfig.appId)
      .setCallback((data: { action: string }) => {
        if (data.action === picker.Action.PICKED) resolve(true);
        else if (data.action === picker.Action.CANCEL) resolve(false);
      })
      .build()
      .setVisible(true);
  });
}
