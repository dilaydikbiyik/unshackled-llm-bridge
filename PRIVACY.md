# Privacy Policy

**Short version: this extension has no servers, and your conversations never leave your browser.**

## What is collected

Nothing is collected. There is no backend, no account system, no analytics, and no telemetry of any
kind. No data about you or your usage is transmitted to the author or to any third party.

## What is stored, and where

Everything below lives in your browser's local extension storage on this device only. It is never
synced to another device and never uploaded.

| Data | Purpose | Stored where |
|---|---|---|
| Conversation packages you transfer | Moving a conversation to another platform | `chrome.storage.session` — cleared when the browser closes |
| Files you upload to a platform | Replaying them on another platform without re-uploading | IndexedDB |
| Archived conversations | Cross-platform search, only if you turn archiving on | IndexedDB |
| Your persona profile | Attaching your preferences to transfers | `chrome.storage.local` |
| Your Anthropic API key, if you provide one | Summarizing long conversations on transfer | `chrome.storage.local` |
| Settings and language | Preferences | `chrome.storage.local` |
| Sites you add yourself | Bridging an AI site beyond the three built-in ones | `chrome.storage.local` |
| Which conversation a fork came from | Offering to carry an answer back to it | `chrome.storage.local` |
| How far a conversation has been relayed | Sending only what the other side has not seen | `chrome.storage.local` |
| Transcripts the extension generates for a transfer | Delivering the context as an attached file | IndexedDB, alongside your own files |

Uninstalling the extension deletes all of it.

## Network requests

The extension makes exactly two kinds of outbound request, and neither carries conversation content
to the author:

1. **Selector configuration.** A periodic fetch of `config/selectors.json` from this project's
   public GitHub repository, so a platform UI change can be fixed without a store update. This is a
   plain file download. Nothing is sent with it.

2. **Summarization, only if you opt in.** If — and only if — you enter your own Anthropic API key
   and choose "transfer summarized", the conversation text is sent from your browser directly to
   `api.anthropic.com` using your key, and the summary comes back to your browser. It does not pass
   through any server operated by this project. Anthropic's handling of that request is governed by
   their own privacy policy and your agreement with them. Leave the API key blank and this request
   is never made.

## Archiving is opt-in

Conversations you visit are archived locally **only** after you enable archiving in the side panel.
It is off by default. Turning it off stops new archiving; existing entries stay until you remove
them or uninstall.

## Diagnostics

The diagnostics report in the side panel contains the extension version, your browser's user agent,
and which DOM selectors are currently failing. It contains no conversation content. It is never
sent anywhere automatically — it is copied to your clipboard for you to share if you choose to.

## Sites you add yourself

The extension ships knowing three sites. Any other AI chat site — including one running on your own
machine, such as a local model's web interface — works only after you add it in the side panel, and
only after you grant permission for that one host in Chrome's own prompt. Nothing is requested for
the web at large. Removing a site from the list withdraws the permission and unregisters its script,
so what the extension can reach is always the list you can see.

## The portable profile

The profile the side panel can draw from your archive is counted on your device, from your own
messages, and is shown to you as a draft before anything is saved. It is never sent anywhere by the
extension; it travels only when you attach it to a transfer that you make.

## Your data on the AI platforms

This extension reads conversations from and writes text into the AI sites you use — in your own
logged-in browser session, on your instruction. **Moving a conversation to another provider shares
it with that provider.** That is the point of the feature, and it is worth stating plainly: a
transcript you carry from one assistant to another is read by the second one under its own terms.
The extension does not change what those platforms collect; their privacy policies continue to
apply to your use of them.

## What the Chrome Web Store asks

The store's disclosure form asks whether the extension collects certain categories of data.
"Collect" there means transmitting data off the device.

| Category | Answer |
|---|---|
| Personally identifiable information | No |
| Health, financial or authentication information | No |
| Personal communications | **Only on your instruction, and never to us.** Conversation text goes to the AI site you transfer it to. If you supply your own Anthropic API key and choose a summarized transfer, it also goes to `api.anthropic.com` under your key. There is no path to any server operated by this project. |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | Read locally, to find the conversation and the message box. Not transmitted to us. |

Data is not sold or transferred to third parties for any purpose unrelated to moving your
conversation, is not used for advertising, and is not used for creditworthiness or lending.

## Changes

Material changes to this policy will be noted in the repository's commit history and release notes.

## Contact

Open an issue on the project's GitHub repository.
