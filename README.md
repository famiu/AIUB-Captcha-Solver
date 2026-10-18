# AIUB Captcha Solver

A browser extension that fills in the math captcha on the [AIUB student portal](https://portal.aiub.edu/) login page, so you only have to type your username and password. The captcha is read by a small neural network that runs entirely in your browser. Nothing is sent anywhere, and the extension requests no permissions beyond running on the portal.

> [!IMPORTANT]
> This project is not affiliated with or endorsed by American International University-Bangladesh.

https://github.com/user-attachments/assets/4aaf2b09-0546-4076-9024-f37c61dec3f8

<sub>Showcase video made with Claude Opus 5.5 under my direction.</sub>

## Installation

Download the latest release from the [Releases](https://github.com/famiu/AIUB-Captcha-Solver/releases/latest) page.

### Firefox (desktop)

1. Download the signed `.xpi` file.
2. Open `about:addons`, click the gear menu and choose **Install Add-on From File…**.
3. Select the downloaded `.xpi`.

### Firefox for Android

1. Download the signed `.xpi` file to your phone.
2. In Firefox, open **Settings → About Firefox** and tap the Firefox logo five times to enable the debug menu.
3. Go back to **Settings**, choose **Install extension from file** and select the `.xpi`.

### Chrome, Edge, Brave and other Chromium-based browsers

1. Download the `.zip` file and extract it.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the extracted folder.

Chrome for Android does not support extensions.

Installed copies do not update themselves. To update, install the new release the same way.

## Usage

Open the [AIUB student portal](https://portal.aiub.edu/) login page. When the captcha appears, the answer field fills in by itself and a green ring pulses around it. If the extension cannot read the captcha after several tries, it stops trying and lets you type the answer.

## Building from source

With [Node.js](https://nodejs.org/) installed, run this from the repository root:

```sh
npx web-ext build --source-dir extension --artifacts-dir dist --overwrite-dest
```

This writes `dist/aiub_captcha_solver-<version>.zip`, which works with all supported browsers. Chromium-based browsers can load it as described above. Firefox needs it to be signed first: upload it to [addons.mozilla.org](https://addons.mozilla.org/developers/addon/submit/distribution) and choose **On your own**, which is free and does not publish the extension.

To retrain the model, see [training/README.md](training/README.md).

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE).

The captcha images in `training/data/real/` were downloaded from the AIUB student portal and are not the project's own work.

> [!NOTE]
> This project is built primarily using AI-coding tools, as I did not want to spend time working on a project like this by hand. I still supervise the overall design, structure and critical decisions of the project, but do not care to check specific implementation details. As a result, this may contain bugs or security issues. Use it at your own risk, and please report any issues you find.
