import type { HTMLElement } from 'node-html-parser';

export function detectCloudflareChallenge(dom: HTMLElement) {
  const domTitle = dom.querySelector('title')?.textContent;
  const bodyErrorText = dom.querySelector('span.challenge-error-text');
  if (domTitle?.includes('Just a moment...') || bodyErrorText) {
    throw new Error('Cloudflare Challenge detected');
  } else {
    throw new Error('Server responded with 403');
  }
}
